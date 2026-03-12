<script lang="ts">
	import type { LobbyPlayer } from '$lib/uno/multiplayer';

	interface Props {
		roomCode: string;
		isHost: boolean;
		players: LobbyPlayer[];
		onStartGame?: () => void;
		onLeave?: () => void;
	}

	let { roomCode, isHost, players, onStartGame, onLeave }: Props = $props();

	let copied = $state(false);

	async function copyCode() {
		await navigator.clipboard.writeText(roomCode);
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 2000);
	}
</script>

<div class="lobby">
	<h2>Online Lobby</h2>

	<div class="room-code-section">
		<label>Room Code</label>
		<div class="code-display">
			<span class="code">{roomCode}</span>
			<button class="copy-btn" onclick={copyCode}>
				{copied ? 'Copied!' : 'Copy'}
			</button>
		</div>
		<p class="hint">Share this code with friends to join</p>
	</div>

	<div class="players-section">
		<h3>Players ({players.length}/4)</h3>
		<div class="player-list">
			{#each players as player, i}
				<div class="player-row">
					<span class="player-num">{i + 1}</span>
					<span class="player-name">{player.name}</span>
					{#if i === 0}
						<span class="host-badge">HOST</span>
					{/if}
				</div>
			{/each}
			{#each Array.from({ length: Math.max(0, 2 - players.length) }) as _}
				<div class="player-row empty">
					<span class="waiting-slot">Waiting for player...</span>
				</div>
			{/each}
		</div>
	</div>

	{#if isHost}
		<button class="start-btn" disabled={players.length < 2} onclick={onStartGame}>
			{players.length < 2 ? 'Waiting for players...' : 'Start Game'}
		</button>
	{:else}
		<p class="waiting-msg">Waiting for host to start the game...</p>
	{/if}

	<button class="leave-btn" onclick={onLeave}>Leave Room</button>
</div>

<style>
	.lobby {
		max-width: 420px;
		width: 90%;
		display: flex;
		flex-direction: column;
		gap: 20px;
		align-items: center;
	}

	.lobby h2 {
		margin: 0;
		font-size: 1.5rem;
	}

	.room-code-section {
		width: 100%;
		text-align: center;
	}

	.room-code-section label {
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 1px;
		display: block;
		margin-bottom: 8px;
	}

	.code-display {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 14px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 12px;
		padding: 14px 20px;
	}

	.code {
		font-size: 2.5rem;
		font-weight: 900;
		letter-spacing: 6px;
		font-family: monospace;
		color: #f1c40f;
	}

	.copy-btn {
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.3);
		color: white;
		padding: 6px 14px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		transition: background 0.15s;
	}

	.copy-btn:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	.hint {
		margin: 8px 0 0;
		font-size: 0.8rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.players-section {
		width: 100%;
	}

	.players-section h3 {
		margin: 0 0 10px;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.7);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.player-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.player-row {
		display: flex;
		align-items: center;
		gap: 12px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		padding: 10px 14px;
	}

	.player-row.empty {
		background: rgba(255, 255, 255, 0.04);
		border: 1px dashed rgba(255, 255, 255, 0.15);
	}

	.player-num {
		width: 20px;
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.85rem;
	}

	.player-name {
		flex: 1;
		font-weight: 500;
	}

	.host-badge {
		font-size: 0.7rem;
		background: #e74c3c;
		padding: 2px 8px;
		border-radius: 4px;
		font-weight: bold;
		letter-spacing: 1px;
	}

	.waiting-slot {
		color: rgba(255, 255, 255, 0.3);
		font-size: 0.85rem;
		font-style: italic;
	}

	.start-btn {
		background: #27ae60;
		border: none;
		color: white;
		padding: 14px 40px;
		border-radius: 8px;
		font-size: 1.1rem;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.2s;
		min-width: 200px;
	}

	.start-btn:hover:not(:disabled) {
		background: #219a52;
		transform: translateY(-2px);
	}

	.start-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.waiting-msg {
		color: rgba(255, 255, 255, 0.6);
		font-style: italic;
		margin: 0;
	}

	.leave-btn {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: rgba(255, 255, 255, 0.5);
		padding: 8px 24px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.15s;
	}

	.leave-btn:hover {
		color: white;
		border-color: rgba(255, 255, 255, 0.4);
	}
</style>
