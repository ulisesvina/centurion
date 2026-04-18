from __future__ import annotations

import argparse
import asyncio
import audioop
import base64
import json
import os
import queue
import signal
import sys
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional
from urllib.parse import urlencode

from aiohttp import web
import requests
import websocket
from dotenv import load_dotenv


ELEVENLABS_STT_WS_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime"
ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
DEFAULT_STT_MODEL_ID = "scribe_v2_realtime"
DEFAULT_TTS_MODEL_ID = "eleven_multilingual_v2"
DEFAULT_TTS_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"
DEFAULT_LANGUAGE_CODE = "spa"
DEFAULT_GREETING_TEXT = "Nueve, uno, uno. ¿Cuál es su emergencia?"
DEFAULT_SAMPLE_RATE = 16000
DEFAULT_ACTIVITY_THRESHOLD = 0.002
DEFAULT_SILENCE_TIMEOUT_SECS = 10.0
DEFAULT_MIN_SPEECH_START_SECS = 0.30
DEFAULT_PUBLIC_BASE_URL = "http://127.0.0.1:5000"
DEFAULT_STREAM_NAME = "caller_audio"
DEFAULT_MLX_MODEL_ID = "mlx-community/Llama-3.2-3B-Instruct-4bit"
DEFAULT_ASSISTANT_PROMPT = (
	"Eres un operador de emergencias 911 profesional y calmado. "
	"Haz preguntas breves y concretas para obtener ubicacion, tipo de emergencia, numero de personas, "
	"peligro inmediato y necesidades medicas. Responde en espanol claro."
)
DEFAULT_ASSISTANT_MAX_TOKENS = 140
DEFAULT_MAX_DIALOG_TURNS = 10


@dataclass
class AppConfig:
	elevenlabs_api_key: str
	public_base_url: str
	stt_model_id: str
	tts_model_id: str
	tts_voice_id: str
	language_code: str
	greeting_text: str
	sample_rate: int
	activity_threshold: float
	silence_timeout_secs: float
	min_speech_start_secs: float
	mlx_model_id: str
	assistant_prompt: str
	assistant_max_tokens: int
	max_dialog_turns: int
	stream_name: str


class ElevenLabsRealtimeTranscriber:
	def __init__(self, api_key: str, model_id: str, language_code: str, on_final_transcript: Optional[Callable[[str], None]] = None):
		self.api_key = api_key
		self.model_id = model_id
		self.language_code = language_code
		self.on_final_transcript = on_final_transcript
		self.audio_queue: "queue.Queue[bytes]" = queue.Queue(maxsize=500)
		self.stop_event = threading.Event()
		self.connected_event = threading.Event()
		self._connect_lock = threading.Lock()
		self._ws_send_lock = threading.Lock()
		self.ws_app: Optional[websocket.WebSocketApp] = None
		self.ws_thread: Optional[threading.Thread] = None
		self.sender_thread: Optional[threading.Thread] = None
		self._last_partial = ""

	def _build_ws_url(self) -> str:
		params = {
			"model_id": self.model_id,
			"audio_format": "pcm_16000",
			"include_timestamps": "false",
			"commit_strategy": "vad",
			"language_code": self.language_code,
		}
		return f"{ELEVENLABS_STT_WS_URL}?{urlencode(params)}"

	def start(self):
		if not self.sender_thread or not self.sender_thread.is_alive():
			self.sender_thread = threading.Thread(target=self._sender_loop, daemon=True)
			self.sender_thread.start()
		self.ensure_connected(wait_secs=3.0)

	def ensure_connected(self, wait_secs: float = 2.0) -> bool:
		if self.stop_event.is_set():
			return False
		if self.connected_event.is_set():
			return True

		with self._connect_lock:
			if self.connected_event.is_set():
				return True
			if not self.ws_thread or not self.ws_thread.is_alive():
				self.ws_app = websocket.WebSocketApp(
					self._build_ws_url(),
					header=[f"xi-api-key: {self.api_key}"],
					on_open=self._on_open,
					on_message=self._on_message,
					on_error=self._on_error,
					on_close=self._on_close,
				)
				self.ws_thread = threading.Thread(
					target=self.ws_app.run_forever,
					kwargs={"ping_interval": 20, "ping_timeout": 10},
					daemon=True,
				)
				self.ws_thread.start()

		deadline = time.monotonic() + max(0.0, wait_secs)
		while time.monotonic() < deadline:
			if self.connected_event.is_set():
				return True
			time.sleep(0.05)
		return self.connected_event.is_set()

	def close(self):
		self.stop_event.set()
		if self.ws_app:
			self.ws_app.close()

	def feed_pcm16(self, pcm_bytes: bytes):
		if self.stop_event.is_set():
			return
		try:
			self.audio_queue.put_nowait(pcm_bytes)
		except queue.Full:
			pass

	def _sender_loop(self):
		while not self.stop_event.is_set():
			try:
				chunk = self.audio_queue.get(timeout=0.2)
			except queue.Empty:
				continue
			if not self.connected_event.is_set():
				continue
			current_ws = self.ws_app
			if current_ws is None:
				continue
			try:
				with self._ws_send_lock:
					current_ws.send(
						json.dumps(
							{
								"message_type": "input_audio_chunk",
								"audio_base_64": base64.b64encode(chunk).decode("ascii"),
							}
						)
					)
			except Exception as err:
				self.connected_event.clear()
				print(f"ElevenLabs send error: {err}", file=sys.stderr)
				self.ensure_connected(wait_secs=0.0)

	def _on_open(self, ws):
		print("ElevenLabs realtime transcription connected.")
		self.connected_event.set()

	def _on_message(self, _ws, message):
		try:
			payload = json.loads(message)
		except json.JSONDecodeError:
			return

		msg_type = payload.get("message_type", "")
		if msg_type == "partial_transcript":
			text = payload.get("text", "").strip()
			if text and text != self._last_partial:
				self._last_partial = text
				sys.stdout.write(f"\rLive: {text}      ")
				sys.stdout.flush()
			return

		if msg_type in ("committed_transcript", "committed_transcript_with_timestamps"):
			text = payload.get("text", "").strip()
			if text:
				self._last_partial = ""
				sys.stdout.write("\r")
				print(f"Final: {text}")
				if self.on_final_transcript:
					try:
						self.on_final_transcript(text)
					except Exception as err:
						print(f"Final transcript callback error: {err}", file=sys.stderr)
			return

		if msg_type.endswith("error"):
			print(f"ElevenLabs error: {payload.get('message', 'unknown error')}", file=sys.stderr)
			self.connected_event.clear()

	def _on_error(self, _ws, error):
		print(f"ElevenLabs websocket error: {error}", file=sys.stderr)
		self.connected_event.clear()

	def _on_close(self, _ws, close_status_code, close_msg):
		self.connected_event.clear()
		if close_status_code is not None:
			print(f"ElevenLabs connection closed ({close_status_code}): {close_msg}")


class LocalMlxConversationAgent:
	def __init__(self, model_id: str, system_prompt: str, max_tokens: int, max_turns: int):
		self.model_id = model_id
		self.system_prompt = system_prompt.strip()
		self.max_tokens = max_tokens
		self.max_turns = max_turns
		self._lock = threading.Lock()
		self._model = None
		self._tokenizer = None
		self._generate_fn = None
		self._history: List[Dict[str, str]] = []
		self.reset()

	def reset(self):
		with self._lock:
			self._history = [{"role": "system", "content": self.system_prompt}]

	def _ensure_loaded(self):
		if self._model is not None and self._tokenizer is not None and self._generate_fn is not None:
			return
		try:
			from mlx_lm import generate, load
		except Exception as err:
			raise RuntimeError(
				"mlx_lm is not installed. Install with: pip install mlx-lm"
			) from err

		print(f"Loading MLX model: {self.model_id}")
		self._model, self._tokenizer = load(self.model_id)
		self._generate_fn = generate
		print("MLX model loaded.")

	def _trim_history(self):
		if len(self._history) <= 1:
			return
		max_messages = 1 + (self.max_turns * 2)
		if len(self._history) > max_messages:
			system_msg = self._history[0]
			recent = self._history[-(max_messages - 1) :]
			self._history = [system_msg] + recent

	def generate_reply(self, user_text: str) -> str:
		clean_text = user_text.strip()
		if not clean_text:
			return ""

		with self._lock:
			self._ensure_loaded()
			self._history.append({"role": "user", "content": clean_text})
			self._trim_history()

			prompt = self._tokenizer.apply_chat_template(
				self._history,
				tokenize=False,
				add_generation_prompt=True,
			)
			# mlx_lm changed temperature kwarg names across versions; try stable options.
			try:
				raw_reply = self._generate_fn(
					self._model,
					self._tokenizer,
					prompt=prompt,
					max_tokens=self.max_tokens,
					temperature=0.3,
				)
			except TypeError:
				raw_reply = self._generate_fn(
					self._model,
					self._tokenizer,
					prompt=prompt,
					max_tokens=self.max_tokens,
				)
			reply = (raw_reply or "").strip()
			if not reply:
				reply = "No pude escuchar con claridad. Puede repetir su emergencia, por favor?"
			self._history.append({"role": "assistant", "content": reply})
			self._trim_history()
			return reply


class CallSession:
	def __init__(self, config: AppConfig):
		self.config = config
		self.transcriber = ElevenLabsRealtimeTranscriber(
			api_key=config.elevenlabs_api_key,
			model_id=config.stt_model_id,
			language_code=config.language_code,
			on_final_transcript=self._on_final_transcript,
		)
		self.agent = LocalMlxConversationAgent(
			model_id=config.mlx_model_id,
			system_prompt=config.assistant_prompt,
			max_tokens=config.assistant_max_tokens,
			max_turns=config.max_dialog_turns,
		)
		self.stop_event = threading.Event()
		self.call_sid: Optional[str] = None
		self.stream_sid: Optional[str] = None
		self._last_final_text = ""
		self._last_final_ts = 0.0
		self._conversation_queue: "queue.Queue[str]" = queue.Queue(maxsize=50)
		self._conversation_thread: Optional[threading.Thread] = None
		self._reply_audio_lock = threading.Lock()
		self._reply_audio_by_id: Dict[str, bytes] = {}
		self._reply_audio_order: List[str] = []
		self._max_reply_audios = 25
		self.twilio_account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
		self.twilio_auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
		self.call_active = False
		self.has_seen_speech = False
		self.silence_secs = 0.0
		self.voiced_run_secs = 0.0
		self.last_speech_ts: Optional[float] = None
		self.ratecv_state = None
		self._last_audio_debug_ts = 0.0
		self._track_debug_seen: set[str] = set()
		self._greeting_audio: bytes = b""
		self._app: Optional[web.Application] = None
		self._runner: Optional[web.AppRunner] = None
		self._site: Optional[web.TCPSite] = None
		self._loop: Optional[asyncio.AbstractEventLoop] = None
		self._server_ready_event = threading.Event()
		self._server_start_error: Optional[str] = None

	def start(self):
		self._greeting_audio = self._load_greeting_audio()
		self.transcriber.start()
		if not self._conversation_thread or not self._conversation_thread.is_alive():
			self._conversation_thread = threading.Thread(target=self._conversation_loop, daemon=True)
			self._conversation_thread.start()
		self._start_server()

	def shutdown(self):
		self.stop_event.set()
		self.call_active = False
		self.transcriber.close()
		if self._loop and self._runner:
			asyncio.run_coroutine_threadsafe(self._runner.cleanup(), self._loop)

	def _base_public_url(self) -> str:
		return self.config.public_base_url.rstrip("/")

	def _public_ws_url(self) -> str:
		base = self._base_public_url()
		if base.startswith("https://"):
			return "wss://" + base[len("https://") :] + "/twilio/stream"
		if base.startswith("http://"):
			return "ws://" + base[len("http://") :] + "/twilio/stream"
		return base + "/twilio/stream"

	def _greeting_audio_url(self) -> str:
		return f"{self._base_public_url()}/audio/greeting.mp3"

	def _reply_audio_url(self, reply_id: str) -> str:
		return f"{self._base_public_url()}/audio/reply/{reply_id}.mp3"

	def _build_twiml(self) -> str:
		return (
			'<?xml version="1.0" encoding="UTF-8"?>'
			"<Response>"
			f'<Start><Stream name="{self.config.stream_name}" track="inbound_track" url="{self._public_ws_url()}" /></Start>'
			f'<Play>{self._greeting_audio_url()}</Play>'
			f'<Redirect method="POST">{self._base_public_url()}/twilio/wait</Redirect>'
			"</Response>"
		)

	def _build_wait_twiml(self) -> str:
		return (
			'<?xml version="1.0" encoding="UTF-8"?>'
			"<Response>"
			'<Pause length="60" />'
			f'<Redirect method="POST">{self._base_public_url()}/twilio/wait</Redirect>'
			"</Response>"
		)

	def _build_reply_twiml(self, reply_id: str) -> str:
		return (
			'<?xml version="1.0" encoding="UTF-8"?>'
			"<Response>"
			f'<Start><Stream name="{self.config.stream_name}" track="inbound_track" url="{self._public_ws_url()}" /></Start>'
			f'<Play>{self._reply_audio_url(reply_id)}</Play>'
			f'<Redirect method="POST">{self._base_public_url()}/twilio/wait</Redirect>'
			"</Response>"
		)

	def _load_greeting_audio(self) -> bytes:
		url = f"{ELEVENLABS_TTS_URL}/{self.config.tts_voice_id}/stream"
		response = requests.post(
			url,
			headers={
				"xi-api-key": self.config.elevenlabs_api_key,
				"Content-Type": "application/json",
				"Accept": "application/octet-stream",
			},
			params={"output_format": "mp3_44100_128"},
			json={"text": self.config.greeting_text, "model_id": self.config.tts_model_id},
			timeout=45,
		)
		response.raise_for_status()
		if not response.content:
			raise RuntimeError("ElevenLabs TTS returned no audio for the greeting.")
		return response.content

	def _load_tts_audio(self, text: str) -> bytes:
		url = f"{ELEVENLABS_TTS_URL}/{self.config.tts_voice_id}/stream"
		response = requests.post(
			url,
			headers={
				"xi-api-key": self.config.elevenlabs_api_key,
				"Content-Type": "application/json",
				"Accept": "application/octet-stream",
			},
			params={"output_format": "mp3_44100_128"},
			json={"text": text, "model_id": self.config.tts_model_id},
			timeout=45,
		)
		response.raise_for_status()
		if not response.content:
			raise RuntimeError("ElevenLabs TTS returned no audio for a conversational reply.")
		return response.content

	def _store_reply_audio(self, audio: bytes) -> str:
		reply_id = uuid.uuid4().hex
		with self._reply_audio_lock:
			self._reply_audio_by_id[reply_id] = audio
			self._reply_audio_order.append(reply_id)
			while len(self._reply_audio_order) > self._max_reply_audios:
				stale_id = self._reply_audio_order.pop(0)
				self._reply_audio_by_id.pop(stale_id, None)
		return reply_id

	def _update_twilio_call_with_reply(self, reply_id: str):
		if not self.call_sid:
			print("Skipping call update: missing CallSid.")
			return
		if not self.twilio_account_sid or not self.twilio_auth_token:
			print("Skipping call update: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to play assistant replies.")
			return

		url = f"https://api.twilio.com/2010-04-01/Accounts/{self.twilio_account_sid}/Calls/{self.call_sid}.json"
		response = requests.post(
			url,
			auth=(self.twilio_account_sid, self.twilio_auth_token),
			data={"Twiml": self._build_reply_twiml(reply_id)},
			timeout=20,
		)
		response.raise_for_status()
		print(f"Assistant reply enqueued to active call (reply_id={reply_id}).")

	def _on_final_transcript(self, text: str):
		clean_text = text.strip()
		if not clean_text or len(clean_text) < 2:
			return
		if not self.call_active:
			return

		now = time.monotonic()
		if clean_text.lower() == self._last_final_text.lower() and (now - self._last_final_ts) < 2.0:
			return

		self._last_final_text = clean_text
		self._last_final_ts = now
		try:
			self._conversation_queue.put_nowait(clean_text)
		except queue.Full:
			print("Dropping transcript: conversation queue is full.", file=sys.stderr)

	def _conversation_loop(self):
		while not self.stop_event.is_set():
			try:
				user_text = self._conversation_queue.get(timeout=0.25)
			except queue.Empty:
				continue

			if not self.call_active:
				continue

			print(f"Caller: {user_text}")
			try:
				reply_text = self.agent.generate_reply(user_text)
			except Exception as err:
				print(f"Local MLX agent error: {err}", file=sys.stderr)
				continue

			reply_text = " ".join(reply_text.split())
			if not reply_text:
				continue
			print(f"Assistant: {reply_text}")

			try:
				reply_audio = self._load_tts_audio(reply_text)
			except Exception as err:
				print(f"Failed to synthesize assistant reply: {err}", file=sys.stderr)
				continue

			reply_id = self._store_reply_audio(reply_audio)
			try:
				self._update_twilio_call_with_reply(reply_id)
			except Exception as err:
				print(f"Failed to inject assistant reply into call: {err}", file=sys.stderr)

	async def _handle_http_request(self, request: web.Request) -> web.Response:
		if request.path == "/health":
			return web.Response(text="ok", content_type="text/plain")

		if request.path == "/audio/greeting.mp3":
			return web.Response(body=self._greeting_audio, content_type="audio/mpeg")

		if request.path.startswith("/audio/reply/") and request.path.endswith(".mp3"):
			reply_name = request.path.split("/")[-1]
			reply_id = reply_name[:-4]
			with self._reply_audio_lock:
				audio = self._reply_audio_by_id.get(reply_id)
			if not audio:
				return web.Response(status=404, text="Reply audio not found", content_type="text/plain")
			return web.Response(body=audio, content_type="audio/mpeg")

		if request.path in {"/", "/twilio/voice"}:
			if request.method == "POST":
				form = await request.post()
				self.call_sid = form.get("CallSid") or self.call_sid
				from_number = form.get("From", "")
				to_number = form.get("To", "")
				if self.call_sid:
					print(f"Inbound call from {from_number} to {to_number}; CallSid={self.call_sid}")
				self.call_active = True
				self.agent.reset()
				self._last_final_text = ""
				self._last_final_ts = 0.0
				self.has_seen_speech = False
				self.silence_secs = 0.0
				self.voiced_run_secs = 0.0
				self.last_speech_ts = None
			return web.Response(text=self._build_twiml(), content_type="text/xml")

		if request.path == "/twilio/wait":
			return web.Response(text=self._build_wait_twiml(), content_type="text/xml")

		if request.path == "/twilio/status":
			form = await request.post()
			call_status = form.get("CallStatus", "")
			if call_status:
				print(f"Twilio call status: {call_status}")
			if call_status in {"completed", "busy", "failed", "no-answer", "canceled"}:
				self.call_active = False
				self.call_sid = None
			return web.Response(status=204)

		return web.Response(status=404, text="Not Found", content_type="text/plain")

	async def _handle_stream_ws(self, request: web.Request) -> web.WebSocketResponse:
		ws = web.WebSocketResponse(heartbeat=20)
		await ws.prepare(request)

		try:
			async for msg in ws:
				if msg.type != web.WSMsgType.TEXT:
					continue

				try:
					payload = json.loads(msg.data)
				except json.JSONDecodeError:
					continue

				event = payload.get("event")
				if event == "start":
					self.stream_sid = payload.get("start", {}).get("streamSid")
					self.call_active = True
					self.has_seen_speech = False
					self.silence_secs = 0.0
					self.voiced_run_secs = 0.0
					self.last_speech_ts = None
					self.ratecv_state = None
					self._last_audio_debug_ts = 0.0
					self._track_debug_seen = set()
					print(f"Twilio stream started: {self.stream_sid}")
					if not self.transcriber.ensure_connected(wait_secs=4.0):
						print("Warning: ElevenLabs STT is not connected; attempting background reconnect.", file=sys.stderr)
					continue

				if event == "stop":
					print("Twilio stream stopped.")
					self.call_active = False
					break

				if event != "media":
					continue

				media = payload.get("media", {})
				track = media.get("track", "")
				normalized_track = track.strip().lower()
				if normalized_track and normalized_track not in {"inbound", "inbound_track"}:
					if normalized_track not in self._track_debug_seen:
						self._track_debug_seen.add(normalized_track)
						print(f"Skipping non-inbound track: {normalized_track}")
					continue

				encoded_audio = media.get("payload", "")
				if not encoded_audio:
					continue

				try:
					ulaw_bytes = base64.b64decode(encoded_audio)
				except Exception:
					continue
				if not ulaw_bytes:
					continue

				pcm_8k = audioop.ulaw2lin(ulaw_bytes, 2)
				pcm_16k, self.ratecv_state = audioop.ratecv(pcm_8k, 2, 1, 8000, 16000, self.ratecv_state)
				if not pcm_16k:
					continue
				self.transcriber.feed_pcm16(pcm_16k)

				rms_8k = audioop.rms(pcm_8k, 2) / 32768.0
				rms_16k = audioop.rms(pcm_16k, 2) / 32768.0
				rms = max(rms_8k, rms_16k)
				frame_secs = len(pcm_16k) / 2 / 16000.0

				now = time.monotonic()
				if now - self._last_audio_debug_ts >= 1.5:
					self._last_audio_debug_ts = now
					print(
						f"Audio debug: track={normalized_track or 'unknown'}, ulaw={len(ulaw_bytes)}B, "
						f"rms8k={rms_8k:.5f}, rms16k={rms_16k:.5f}, threshold={self.config.activity_threshold:.5f}, "
						f"voiced_run={self.voiced_run_secs:.2f}s, seen_speech={self.has_seen_speech}, silence={self.silence_secs:.2f}s"
					)

				if rms >= self.config.activity_threshold:
					self.voiced_run_secs += frame_secs
					self.last_speech_ts = now
					if not self.has_seen_speech and self.voiced_run_secs >= self.config.min_speech_start_secs:
						self.has_seen_speech = True
						self.silence_secs = 0.0
						print(f"Speech detected on inbound track (voiced {self.voiced_run_secs:.2f}s).")
				else:
					self.voiced_run_secs = 0.0

				if self.has_seen_speech and self.last_speech_ts is not None:
					self.silence_secs = now - self.last_speech_ts

				if self.call_active and self.has_seen_speech and self.silence_secs >= self.config.silence_timeout_secs:
					print("No se detectó audio por 10s. Finalizando la llamada.")
					self.call_active = False
					await ws.close()
					break
		finally:
			return ws

	def _start_server(self):
		self._server_ready_event.clear()
		self._server_start_error = None

		async def run():
			self._app = web.Application()
			self._app.router.add_route("*", "/", self._handle_http_request)
			self._app.router.add_route("*", "/twilio/voice", self._handle_http_request)
			self._app.router.add_route("*", "/twilio/wait", self._handle_http_request)
			self._app.router.add_route("*", "/twilio/status", self._handle_http_request)
			self._app.router.add_route("GET", "/twilio/stream", self._handle_stream_ws)
			self._app.router.add_route("GET", "/health", self._handle_http_request)
			self._app.router.add_route("GET", "/audio/greeting.mp3", self._handle_http_request)
			self._app.router.add_route("GET", "/audio/reply/{reply_id}.mp3", self._handle_http_request)

			self._runner = web.AppRunner(self._app)
			await self._runner.setup()
			self._site = web.TCPSite(self._runner, "0.0.0.0", 5000)
			await self._site.start()
			print("aiohttp server listening on 0.0.0.0:5000")
			self._server_ready_event.set()

		def thread_main():
			try:
				self._loop = asyncio.new_event_loop()
				asyncio.set_event_loop(self._loop)
				self._loop.run_until_complete(run())
				self._loop.run_forever()
			except Exception as err:
				self._server_start_error = str(err)
				self._server_ready_event.set()
				print(f"aiohttp server failed to start: {err}", file=sys.stderr)

		threading.Thread(target=thread_main, daemon=True).start()
		if not self._server_ready_event.wait(timeout=5.0):
			raise RuntimeError("aiohttp server did not become ready within 5 seconds.")
		if self._server_start_error:
			raise RuntimeError(f"aiohttp server failed to start: {self._server_start_error}")

	def run(self):
		print("Waiting for inbound Twilio calls. Point your Twilio number to the ngrok URL using POST.")
		print(f"Public webhook base URL: {self._base_public_url()}")
		print(f"Twilio voice webhook: {self._base_public_url()}/twilio/voice")
		print(f"Twilio wait webhook: {self._base_public_url()}/twilio/wait")
		print(f"Twilio status webhook: {self._base_public_url()}/twilio/status")
		print(f"Twilio media stream: {self._public_ws_url()}")
		if not self.twilio_account_sid or not self.twilio_auth_token:
			print("Note: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN for live assistant reply playback.")
		print(f"MLX model: {self.config.mlx_model_id}")
		while not self.stop_event.is_set():
			time.sleep(0.2)


def parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Inbound Twilio voice call handler with ElevenLabs transcription")
	parser.add_argument(
		"--public-base-url",
		default=DEFAULT_PUBLIC_BASE_URL,
		help="Public base URL Twilio can reach. Use your ngrok HTTPS URL for real calls.",
	)
	parser.add_argument("--stt-model-id", default=DEFAULT_STT_MODEL_ID, help="ElevenLabs realtime speech-to-text model id")
	parser.add_argument("--tts-model-id", default=DEFAULT_TTS_MODEL_ID, help="ElevenLabs text-to-speech model id")
	parser.add_argument("--tts-voice-id", default=DEFAULT_TTS_VOICE_ID, help="ElevenLabs voice id for the greeting")
	parser.add_argument("--language-code", default=DEFAULT_LANGUAGE_CODE, help="Language code for ElevenLabs STT, default spa")
	parser.add_argument("--greeting-text", default=DEFAULT_GREETING_TEXT, help="Greeting spoken as soon as the call answers")
	parser.add_argument("--sample-rate", type=int, default=DEFAULT_SAMPLE_RATE, help="Internal resampling rate for ElevenLabs STT")
	parser.add_argument("--activity-threshold", type=float, default=DEFAULT_ACTIVITY_THRESHOLD, help="RMS threshold for speech activity detection")
	parser.add_argument("--mlx-model-id", default=DEFAULT_MLX_MODEL_ID, help="Local MLX model id used for conversational replies")
	parser.add_argument("--assistant-prompt", default=DEFAULT_ASSISTANT_PROMPT, help="System prompt for the local conversational agent")
	parser.add_argument("--assistant-max-tokens", type=int, default=DEFAULT_ASSISTANT_MAX_TOKENS, help="Max tokens generated per assistant turn")
	parser.add_argument("--max-dialog-turns", type=int, default=DEFAULT_MAX_DIALOG_TURNS, help="Conversation memory length in turns")
	parser.add_argument(
		"--min-speech-start-secs",
		type=float,
		default=DEFAULT_MIN_SPEECH_START_SECS,
		help="Required continuous voiced duration before silence timeout is armed",
	)
	parser.add_argument("--silence-timeout-secs", type=float, default=DEFAULT_SILENCE_TIMEOUT_SECS, help="End the call after this many seconds of silence")
	return parser.parse_args()


def build_config(args: argparse.Namespace) -> AppConfig:
	elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
	if not elevenlabs_api_key:
		raise RuntimeError("ELEVENLABS_API_KEY is not set.")

	return AppConfig(
		elevenlabs_api_key=elevenlabs_api_key,
		public_base_url=args.public_base_url,
		stt_model_id=args.stt_model_id,
		tts_model_id=args.tts_model_id,
		tts_voice_id=args.tts_voice_id,
		language_code=args.language_code,
		greeting_text=args.greeting_text,
		sample_rate=args.sample_rate,
		activity_threshold=args.activity_threshold,
		mlx_model_id=args.mlx_model_id,
		assistant_prompt=args.assistant_prompt,
		assistant_max_tokens=args.assistant_max_tokens,
		max_dialog_turns=args.max_dialog_turns,
		min_speech_start_secs=args.min_speech_start_secs,
		silence_timeout_secs=args.silence_timeout_secs,
		stream_name=DEFAULT_STREAM_NAME,
	)


def main():
	load_dotenv()
	args = parse_args()
	config = build_config(args)
	session = CallSession(config)

	def request_stop(_sig, _frame):
		session.shutdown()

	signal.signal(signal.SIGINT, request_stop)
	signal.signal(signal.SIGTERM, request_stop)

	session.start()
	session.run()


if __name__ == "__main__":
	main()
