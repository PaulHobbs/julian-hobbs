<script lang="ts">
	import type { Player } from '$lib/uno/types';

	interface Props {
		player: Player;
		isCurrentTurn: boolean;
	}

	let { player, isCurrentTurn }: Props = $props();
</script>

<div class="player-info" class:active={isCurrentTurn} class:uno={player.calledUno && player.hand.length === 1}>
	<span class="name">{player.name}</span>
	<span class="cards">{player.hand.length} card{player.hand.length !== 1 ? 's' : ''}</span>
	{#if player.score > 0}
		<span class="score">{player.score} pts</span>
	{/if}
	{#if player.calledUno && player.hand.length === 1}
		<span class="uno-badge">UNO!</span>
	{/if}
	{#if player.type === 'ai'}
		<span class="ai-badge">{player.aiDifficulty}</span>
	{/if}
</div>

<style>
	.player-info {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 20px;
		font-size: 0.85rem;
		color: #ccc;
		transition: all 0.2s;
	}

	.player-info.active {
		background: rgba(255, 255, 255, 0.2);
		color: white;
		box-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
	}

	.player-info.uno {
		border: 2px solid #e74c3c;
	}

	.name {
		font-weight: bold;
	}

	.cards {
		opacity: 0.7;
	}

	.score {
		color: #f1c40f;
		font-weight: bold;
	}

	.uno-badge {
		color: #e74c3c;
		font-weight: 900;
		font-size: 0.75rem;
		animation: pulse 0.8s infinite;
	}

	.ai-badge {
		font-size: 0.65rem;
		text-transform: uppercase;
		background: rgba(255, 255, 255, 0.15);
		padding: 1px 6px;
		border-radius: 8px;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
</style>
