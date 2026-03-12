import type { Card, CardColor, CardValue, NumberValue } from './types';
import { CARD_COLORS, CARDS_PER_PLAYER } from './constants';

let cardIdCounter = 0;

function makeCard(color: CardColor | null, value: CardValue): Card {
	return { id: `card-${cardIdCounter++}`, color, value };
}

export function createDeck(): Card[] {
	// Don't reset counter — keep IDs unique across rounds to avoid Svelte keyed-each issues
	const cards: Card[] = [];

	for (const color of CARD_COLORS) {
		// One 0 per color
		cards.push(makeCard(color, 0));
		// Two each of 1-9
		for (let n = 1; n <= 9; n++) {
			cards.push(makeCard(color, n as NumberValue));
			cards.push(makeCard(color, n as NumberValue));
		}
		// Two each of action cards
		for (const action of ['skip', 'reverse', 'draw2'] as const) {
			cards.push(makeCard(color, action));
			cards.push(makeCard(color, action));
		}
	}

	// 4 Wilds and 4 Wild Draw 4s
	for (let i = 0; i < 4; i++) {
		cards.push(makeCard(null, 'wild'));
		cards.push(makeCard(null, 'wild_draw4'));
	}

	return cards;
}

export function shuffleDeck(deck: Card[]): Card[] {
	const shuffled = [...deck];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

export function dealHands(
	deck: Card[],
	playerCount: number,
	cardsPerPlayer: number = CARDS_PER_PLAYER
): { hands: Card[][]; remaining: Card[] } {
	const remaining = [...deck];
	const hands: Card[][] = [];

	for (let p = 0; p < playerCount; p++) {
		hands.push(remaining.splice(0, cardsPerPlayer));
	}

	return { hands, remaining };
}

export function findStartCard(deck: Card[]): { startCard: Card; remaining: Card[] } {
	const remaining = [...deck];

	// Find first number card to start with
	for (let i = 0; i < remaining.length; i++) {
		if (typeof remaining[i].value === 'number') {
			const [startCard] = remaining.splice(i, 1);
			return { startCard, remaining };
		}
	}

	// Fallback: just use first card
	const startCard = remaining.shift()!;
	return { startCard, remaining };
}

export function reshuffleDiscardIntoDraw(
	drawPile: Card[],
	discardPile: Card[]
): { drawPile: Card[]; discardPile: Card[] } {
	if (drawPile.length > 0) return { drawPile, discardPile };

	const topCard = discardPile[discardPile.length - 1];
	const toShuffle = discardPile.slice(0, -1).map((c) => ({
		...c,
		chosenColor: undefined
	}));

	return {
		drawPile: shuffleDeck(toShuffle),
		discardPile: [topCard]
	};
}
