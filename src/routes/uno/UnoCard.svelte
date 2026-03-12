<script lang="ts">
	import type { Card } from '$lib/uno/types';
	import { COLOR_HEX, COLOR_DARK_HEX, ACTION_SYMBOLS } from '$lib/uno/constants';

	interface Props {
		card?: Card;
		faceDown?: boolean;
		playable?: boolean;
		selected?: boolean;
		small?: boolean;
		onclick?: () => void;
	}

	let { card, faceDown = false, playable = false, selected = false, small = false, onclick }: Props = $props();

	let displayValue = $derived.by(() => {
		if (!card || faceDown) return '';
		if (typeof card.value === 'number') return String(card.value);
		return ACTION_SYMBOLS[card.value] ?? card.value;
	});

	let bgColor = $derived.by(() => {
		if (!card || faceDown) return '#1a1a2e';
		if (card.value === 'wild' || card.value === 'wild_draw4') {
			return card.chosenColor ? COLOR_HEX[card.chosenColor] : '#333';
		}
		return card.color ? COLOR_HEX[card.color] : '#333';
	});

	let borderColor = $derived.by(() => {
		if (!card || faceDown) return '#333';
		if (card.value === 'wild' || card.value === 'wild_draw4') {
			return card.chosenColor ? COLOR_DARK_HEX[card.chosenColor] : '#555';
		}
		return card.color ? COLOR_DARK_HEX[card.color] : '#555';
	});

	let isWild = $derived(card && (card.value === 'wild' || card.value === 'wild_draw4'));
</script>

<button
	class="uno-card"
	class:face-down={faceDown}
	class:playable
	class:selected
	class:small
	class:wild={isWild && !faceDown}
	style="--card-bg: {bgColor}; --card-border: {borderColor}"
	onclick={onclick}
	disabled={!playable && !faceDown}
>
	{#if faceDown}
		<span class="card-back">UNO</span>
	{:else if isWild && !card?.chosenColor}
		<div class="wild-face">
			<div class="wild-quadrant red"></div>
			<div class="wild-quadrant blue"></div>
			<div class="wild-quadrant green"></div>
			<div class="wild-quadrant yellow"></div>
			<span class="wild-label">{displayValue}</span>
		</div>
	{:else}
		<span class="card-value">{displayValue}</span>
	{/if}
</button>

<style>
	.uno-card {
		width: 70px;
		height: 100px;
		border-radius: 10px;
		border: 3px solid var(--card-border);
		background: var(--card-bg);
		color: white;
		font-size: 1.5rem;
		font-weight: bold;
		cursor: default;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.15s, box-shadow 0.15s;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5);
		flex-shrink: 0;
		padding: 0;
		font-family: inherit;
	}

	.uno-card.small {
		width: 45px;
		height: 65px;
		font-size: 1rem;
		border-radius: 6px;
		border-width: 2px;
	}

	.uno-card.playable {
		cursor: pointer;
		box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
	}

	.uno-card.playable:hover {
		transform: translateY(-10px);
		box-shadow: 0 6px 20px rgba(255, 255, 255, 0.4);
	}

	.uno-card.selected {
		transform: translateY(-15px);
		box-shadow: 0 8px 25px rgba(255, 255, 255, 0.6);
		outline: 2px solid white;
	}

	.face-down {
		background: #1a1a2e;
		border-color: #2d1b69;
	}

	.card-back {
		font-size: 0.9rem;
		color: #e74c3c;
		text-transform: uppercase;
		letter-spacing: 2px;
		font-weight: 900;
		transform: rotate(-30deg);
	}

	.small .card-back {
		font-size: 0.6rem;
		letter-spacing: 1px;
	}

	.card-value {
		font-size: inherit;
	}

	.wild-face {
		position: absolute;
		inset: 3px;
		border-radius: 6px;
		overflow: hidden;
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
	}

	.wild-quadrant {
		opacity: 0.8;
	}

	.wild-quadrant.red { background: #e74c3c; }
	.wild-quadrant.blue { background: #3498db; }
	.wild-quadrant.green { background: #2ecc71; }
	.wild-quadrant.yellow { background: #f1c40f; }

	.wild-label {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 1.2rem;
		color: white;
		text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.8);
		z-index: 1;
	}

	.small .wild-label {
		font-size: 0.8rem;
	}
</style>
