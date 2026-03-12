import type { Player, RoundResult } from './types';
import { CARD_POINTS } from './constants';

export function calculateRoundScore(
	players: Player[],
	winnerId: string
): Record<string, number> {
	const scores: Record<string, number> = {};

	// Winner gets points from all opponents' remaining cards
	let winnerPoints = 0;

	for (const player of players) {
		if (player.id === winnerId) {
			scores[player.id] = 0; // Winner scores 0 for themselves this round
			continue;
		}

		let playerHandValue = 0;
		for (const card of player.hand) {
			if (typeof card.value === 'number') {
				playerHandValue += card.value;
			} else {
				playerHandValue += CARD_POINTS[card.value] ?? 0;
			}
		}
		scores[player.id] = 0;
		winnerPoints += playerHandValue;
	}

	scores[winnerId] = winnerPoints;
	return scores;
}

export function applyRoundScores(
	players: Player[],
	roundScores: Record<string, number>
): Player[] {
	return players.map((p) => ({
		...p,
		score: p.score + (roundScores[p.id] ?? 0)
	}));
}

export function createRoundResult(
	roundNumber: number,
	winnerId: string,
	scores: Record<string, number>
): RoundResult {
	return { roundNumber, winnerId, scores };
}

export function checkGameEnd(players: Player[], targetScore: number): string | null {
	for (const player of players) {
		if (player.score >= targetScore) {
			return player.id;
		}
	}
	return null;
}
