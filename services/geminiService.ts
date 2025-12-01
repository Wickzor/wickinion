import { GoogleGenAI } from "@google/genai";
import { GameState, CardDef } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getRoyalAdvice = async (gameState: GameState): Promise<string> => {
  try {
    const handNames = gameState.hand.map(c => c.name).join(', ');
    const supplyStatus = Object.entries(gameState.supply)
      .filter(([_, count]) => count > 0)
      .map(([id, count]) => id)
      .join(', ');

    const prompt = `
      You are a wise Royal Advisor in a medieval card game similar to Dominion.
      
      Current Game State:
      - Actions remaining: ${gameState.actions}
      - Buys remaining: ${gameState.buys}
      - Gold available: ${gameState.gold}
      - Turn Number: ${gameState.turnCount}
      - Cards in Hand: ${handNames}
      - Cards available to buy in Supply: ${supplyStatus}
      
      Give me short, strategic advice (max 2 sentences) on what to play or what to buy. 
      Speak in a slightly medieval, courtly tone.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || "My lord, the spirits are silent. I have no advice.";
  } catch (error) {
    console.error("Error fetching advice:", error);
    return "My lord, I am currently unable to consult the archives (Network Error).";
  }
};
