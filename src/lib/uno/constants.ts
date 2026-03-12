import type { CardColor, HouseRules } from './types';

export const CARD_COLORS: CardColor[] = ['red', 'blue', 'green', 'yellow'];

export const COLOR_HEX: Record<CardColor, string> = {
	red: '#e74c3c',
	blue: '#3498db',
	green: '#2ecc71',
	yellow: '#f1c40f'
};

export const COLOR_DARK_HEX: Record<CardColor, string> = {
	red: '#c0392b',
	blue: '#2980b9',
	green: '#27ae60',
	yellow: '#d4ac0d'
};

export const ACTION_SYMBOLS: Record<string, string> = {
	skip: '\u{1F6AB}',
	reverse: '\u{1F503}',
	draw2: '+2',
	wild: '\u{1F308}',
	wild_draw4: '+4'
};

export const CARD_POINTS: Record<string, number> = {
	skip: 20,
	reverse: 20,
	draw2: 20,
	wild: 50,
	wild_draw4: 50
};

export const DEFAULT_HOUSE_RULES: HouseRules = {
	stacking: false,
	jumpIn: false,
	sevenSwap: false,
	zeroRotate: false,
	forcePlay: false,
	drawUntilPlayable: false
};

export const CARDS_PER_PLAYER = 7;
export const DEFAULT_TARGET_SCORE = 500;
export const UNO_PENALTY_CARDS = 2;
export const UNO_WINDOW_MS = 3000;

export const AI_NAMES = ['Bot Alice', 'Bot Bob', 'Bot Carol', 'Bot Dave'];
