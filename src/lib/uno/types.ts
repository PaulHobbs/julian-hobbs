// Card types
export type CardColor = 'red' | 'blue' | 'green' | 'yellow';

export type NumberValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type ActionValue = 'skip' | 'reverse' | 'draw2';
export type WildValue = 'wild' | 'wild_draw4';
export type CardValue = NumberValue | ActionValue | WildValue;

export interface Card {
	id: string;
	color: CardColor | null; // null for wild cards
	value: CardValue;
	chosenColor?: CardColor; // set when a wild is played
}

// Player types
export type PlayerType = 'human' | 'ai';
export type AIDifficulty = 'easy' | 'medium' | 'hard';

export interface Player {
	id: string;
	name: string;
	type: PlayerType;
	aiDifficulty?: AIDifficulty;
	hand: Card[];
	score: number;
	calledUno: boolean;
	isConnected: boolean;
}

// Game state
export type GamePhase = 'lobby' | 'playing' | 'round_end' | 'game_end';
export type TurnDirection = 1 | -1;

export interface HouseRules {
	stacking: boolean;
	jumpIn: boolean;
	sevenSwap: boolean;
	zeroRotate: boolean;
	forcePlay: boolean;
	drawUntilPlayable: boolean;
}

export interface RoundResult {
	roundNumber: number;
	winnerId: string;
	scores: Record<string, number>;
}

export interface GameState {
	phase: GamePhase;
	players: Player[];
	currentPlayerIndex: number;
	direction: TurnDirection;
	drawPile: Card[];
	discardPile: Card[];
	activeColor: CardColor;

	// Pending effects
	pendingDraw: number;
	mustCallUno: string | null;

	// Wild card color picking
	awaitingColorChoice: boolean;
	colorChooserPlayerId: string | null;

	// UNO challenge window
	unoWindowOpen: boolean;
	unoWindowTargetId: string | null;

	// House rules
	houseRules: HouseRules;

	// Scoring
	roundNumber: number;
	targetScore: number;
	roundHistory: RoundResult[];

	// Turn state
	hasDrawnThisTurn: boolean;
	drawnCard: Card | null;

	// Message log
	log: string[];
}

// Network message types
export type MessageType =
	| 'join_request'
	| 'join_accepted'
	| 'join_rejected'
	| 'player_joined'
	| 'player_left'
	| 'game_start'
	| 'state_update'
	| 'play_card'
	| 'draw_card'
	| 'call_uno'
	| 'challenge_uno'
	| 'choose_color'
	| 'choose_swap_target'
	| 'ping'
	| 'pong';

export interface NetworkMessage {
	type: MessageType;
	payload: unknown;
	senderId: string;
	timestamp: number;
}
