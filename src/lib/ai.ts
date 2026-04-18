import type { EmergencyType, Priority } from "@/generated/prisma/enums";

// Resultado que la IA tiene que devolver para crear la emergencia
export type ClassificationResult = {
  type: EmergencyType;
  priority: Priority;
  description: string;
  addressId?: string; // ID de un Address guardado, o dejar vacío si no hay
  aiMetadata: {
    model: string;
    confidence: number;
    // TODO: agregar los campos extra que devuelva su modelo (tokens, latencia, etc.)
  };
};

// ─── CONECTAR LA IA AQUÍ ──────────────────────────────────────────────────────
//
// Esta función recibe el transcript completo de la llamada y debe devolver
// un ClassificationResult con la emergencia clasificada.
//
// Pasos a implementar:
//   1. Construir el prompt con el transcript
//   2. Llamar al modelo
//   3. Parsear la respuesta al formato ClassificationResult
//   4. Retornar el resultado
//
// Ejemplo de prompt sugerido:
//   "Eres un clasificador de emergencias del 911 en México.
//    Analiza esta transcripción y responde en JSON con:
//    type (MEDICAL|CRIME|ACCIDENT|OTHER|IRRELEVANT),
//    priority (CRITICAL|HIGH|MEDIUM|LOW),
//    description,
//    address (si se menciona una ubicación, si no omítela).
//    Transcripción: {transcript}"
//
// ─────────────────────────────────────────────────────────────────────────────
export async function classifyTranscript(transcript: string): Promise<ClassificationResult> {
  // TODO: reemplazar este bloque con la llamada real al modelo de IA
  // -------------------------------------------------------------------------
  // Ejemplo con OpenAI:
  //   import OpenAI from "openai"
  //   const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  //   const response = await openai.chat.completions.create({ ... })
  //
  // Ejemplo con Anthropic:
  //   import Anthropic from "@anthropic-ai/sdk"
  //   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  //   const message = await client.messages.create({ ... })
  // -------------------------------------------------------------------------

  // Placeholder temporal para que el endpoint no falle mientras integran la IA.
  // Eliminar cuando esté conectado el modelo real.
  void transcript;
  throw new Error(
    "AI not implemented yet. Connect the model in src/lib/ai.ts → classifyTranscript()"
  );
}
