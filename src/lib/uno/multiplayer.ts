import type { GameState, NetworkMessage } from './types';

export interface LobbyPlayer {
	id: string;
	name: string;
}

export interface MultiplayerCallbacks {
	onStateUpdate?: (state: GameState) => void;
	onRoundEndReceived?: (winnerId: string, state: GameState) => void;
	onPlayerJoined?: (peerId: string, name: string) => void;
	onPlayerLeft?: (peerId: string) => void;
	onRemoteAction?: (peerId: string, msg: NetworkMessage) => void;
	onError?: (error: string) => void;
}

export class MultiplayerManager {
	private peer: unknown;
	private connections: Map<string, unknown> = new Map();
	private callbacks: MultiplayerCallbacks;
	public isHost: boolean;
	public roomCode: string;
	public myPlayerId: string;

	private constructor(
		peer: unknown,
		isHost: boolean,
		roomCode: string,
		callbacks: MultiplayerCallbacks
	) {
		this.peer = peer;
		this.isHost = isHost;
		this.roomCode = roomCode;
		this.myPlayerId = (peer as { id: string }).id;
		this.callbacks = callbacks;
	}

	static async createRoom(callbacks: MultiplayerCallbacks): Promise<MultiplayerManager> {
		const { Peer } = await import('peerjs');

		let roomCode = generateRoomCode();
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let peer: any;

		// Retry if peer ID is taken
		while (true) {
			peer = new Peer(`uno-${roomCode}`);
			try {
				await new Promise<void>((resolve, reject) => {
					peer.on('open', () => resolve());
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					peer.on('error', (err: any) => {
						if (err.type === 'unavailable-id') {
							peer.destroy();
							reject(new Error('id-taken'));
						} else {
							reject(err);
						}
					});
				});
				break;
			} catch (e: unknown) {
				if (e instanceof Error && e.message === 'id-taken') {
					roomCode = generateRoomCode();
					continue;
				}
				throw e;
			}
		}

		const manager = new MultiplayerManager(peer, true, roomCode, callbacks);

		// Host listens for incoming connections
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		peer.on('connection', (conn: any) => {
			manager.handleIncomingConnection(conn);
		});

		return manager;
	}

	static async joinRoom(
		roomCode: string,
		playerName: string,
		callbacks: MultiplayerCallbacks
	): Promise<{ manager: MultiplayerManager; playerId: string }> {
		const { Peer } = await import('peerjs');

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const peer: any = new Peer();

		await new Promise<void>((resolve, reject) => {
			peer.on('open', () => resolve());
			peer.on('error', reject);
		});

		const manager = new MultiplayerManager(peer, false, roomCode.toUpperCase(), callbacks);

		const hostId = `uno-${roomCode.toUpperCase()}`;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const conn: any = peer.connect(hostId);
		manager.connections.set(hostId, conn);

		await new Promise<void>((resolve, reject) => {
			conn.on('open', () => {
				conn.send({
					type: 'join_request',
					payload: { name: playerName },
					senderId: peer.id,
					timestamp: Date.now()
				} satisfies NetworkMessage);
				resolve();
			});
			conn.on('error', reject);
		});

		conn.on('data', (data: NetworkMessage) => {
			manager.handleMessage(data, conn.peer);
		});

		conn.on('close', () => {
			callbacks.onPlayerLeft?.(conn.peer);
		});

		return { manager, playerId: peer.id };
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private handleIncomingConnection(conn: any) {
		conn.on('open', () => {
			this.connections.set(conn.peer, conn);
		});

		conn.on('data', (data: NetworkMessage) => {
			this.handleMessage(data, conn.peer);
		});

		conn.on('close', () => {
			this.connections.delete(conn.peer);
			this.callbacks.onPlayerLeft?.(conn.peer);
		});
	}

	private handleMessage(msg: NetworkMessage, fromPeerId: string) {
		switch (msg.type) {
			case 'join_request':
				if (this.isHost) {
					const joinPayload = msg.payload as { name: string };
					this.callbacks.onPlayerJoined?.(fromPeerId, joinPayload.name);
				}
				break;

			case 'state_update':
				if (!this.isHost) {
					const statePayload = msg.payload as { state: GameState };
					this.callbacks.onStateUpdate?.(statePayload.state);
				}
				break;

			case 'round_end':
				if (!this.isHost) {
					const roundPayload = msg.payload as { winnerId: string; state: GameState };
					this.callbacks.onRoundEndReceived?.(roundPayload.winnerId, roundPayload.state);
				}
				break;

			case 'player_joined':
				if (!this.isHost) {
					const pjPayload = msg.payload as { id: string; name: string };
					this.callbacks.onPlayerJoined?.(pjPayload.id, pjPayload.name);
				}
				break;

			default:
				// Guest action messages routed to host handler
				if (this.isHost) {
					this.callbacks.onRemoteAction?.(fromPeerId, msg);
				}
				break;
		}
	}

	broadcastState(state: GameState) {
		if (!this.isHost) return;
		const msg: NetworkMessage = {
			type: 'state_update',
			payload: { state },
			senderId: this.myPlayerId,
			timestamp: Date.now()
		};
		this.broadcast(msg);
	}

	broadcastRoundEnd(winnerId: string, state: GameState) {
		if (!this.isHost) return;
		const msg: NetworkMessage = {
			type: 'round_end',
			payload: { winnerId, state },
			senderId: this.myPlayerId,
			timestamp: Date.now()
		};
		this.broadcast(msg);
	}

	broadcastPlayerJoined(id: string, name: string) {
		if (!this.isHost) return;
		const msg: NetworkMessage = {
			type: 'player_joined',
			payload: { id, name },
			senderId: this.myPlayerId,
			timestamp: Date.now()
		};
		this.broadcast(msg);
	}

	/** Send the full current lobby roster to a specific newly-joined peer */
	sendRosterToPeer(peerId: string, players: LobbyPlayer[]) {
		if (!this.isHost) return;
		const conn = this.connections.get(peerId) as { send: (m: unknown) => void } | undefined;
		if (!conn) return;
		for (const player of players) {
			if (player.id === peerId) continue; // They already know about themselves
			conn.send({
				type: 'player_joined',
				payload: { id: player.id, name: player.name },
				senderId: this.myPlayerId,
				timestamp: Date.now()
			} satisfies NetworkMessage);
		}
	}

	sendAction(msg: NetworkMessage) {
		if (this.isHost) return;
		const hostId = `uno-${this.roomCode}`;
		const conn = this.connections.get(hostId) as { send: (m: unknown) => void } | undefined;
		conn?.send(msg);
	}

	private broadcast(msg: NetworkMessage) {
		for (const conn of this.connections.values()) {
			(conn as { send: (m: unknown) => void }).send(msg);
		}
	}

	destroy() {
		(this.peer as { destroy: () => void })?.destroy();
	}
}

function generateRoomCode(): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let code = '';
	for (let i = 0; i < 6; i++) {
		code += chars[Math.floor(Math.random() * chars.length)];
	}
	return code;
}
