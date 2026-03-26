<script lang="ts">
	// Paint mixing using a CMY-based subtractive model tuned for artist's primaries:
	//   Red   → C=0,   M=1,   Y=1   (absorbs cyan, reflects red)
	//   Yellow → C=0,   M=0,   Y=1   (absorbs blue)
	//   Blue  → C=1,   M=0.5, Y=0   (absorbs red+some green, reflects blue)
	//   White → C=0,   M=0,   Y=0   (no absorption)
	//   Black → C=1,   M=1,   Y=1   (absorbs all)
	// Mixing: weighted average in CMY space → convert back to RGB.

	type Mode = 'free' | 'challenge';

	interface Paint {
		key: string;
		label: string;
		rgb: string;
		cmy: [number, number, number];
	}

	const PAINTS: Paint[] = [
		{ key: 'red',    label: 'Red',    rgb: '#dc1414', cmy: [0,   1,   1  ] },
		{ key: 'yellow', label: 'Yellow', rgb: '#ffe000', cmy: [0,   0,   1  ] },
		{ key: 'blue',   label: 'Blue',   rgb: '#1a5fff', cmy: [1,   0.5, 0  ] },
		{ key: 'white',  label: 'White',  rgb: '#f8f8f8', cmy: [0,   0,   0  ] },
		{ key: 'black',  label: 'Black',  rgb: '#1a1a1a', cmy: [1,   1,   1  ] },
	];

	const MAX_DROPS_PER = 10;
	const MAX_DROPS_TOTAL = 20;

	interface Challenge {
		name: string;
		hint: string;
		target: [number, number, number];
	}

	const CHALLENGES: Challenge[] = [
		{
			name: 'Orange',
			hint: 'Mix Red and Yellow in equal amounts.',
			target: [255, 127, 0],
		},
		{
			name: 'Sage Green',
			hint: 'Mix Yellow and Blue in equal amounts.',
			target: [127, 191, 127],
		},
		{
			name: 'Purple',
			hint: 'Mix Red and Blue in equal amounts.',
			target: [127, 64, 127],
		},
		{
			name: 'Pink',
			hint: 'Mix Red with White.',
			target: [255, 127, 127],
		},
		{
			name: 'Lime Green',
			hint: 'Mix more Yellow than Blue.',
			target: [178, 217, 77],
		},
		{
			name: 'Brown',
			hint: 'Mix Red, Yellow, Blue, and a little Black.',
			target: [178, 89, 25],
		},
	];

	let mode = $state<Mode>('free');
	let drops: Record<string, number> = $state({ red: 0, yellow: 0, blue: 0, white: 0, black: 0 });
	let challengeIndex = $state(0);
	let showHint = $state(false);
	let won = $state(false);
	let confettiActive = $state(false);
	let allDone = $state(false);
	let confettiTimer: ReturnType<typeof setTimeout> | null = null;

	function totalDrops(): number {
		return Object.values(drops).reduce((s, v) => s + v, 0);
	}

	function addDrop(key: string): void {
		if (drops[key] >= MAX_DROPS_PER) return;
		if (totalDrops() >= MAX_DROPS_TOTAL) return;
		drops[key]++;
		checkWin();
	}

	function removeDrop(key: string): void {
		if (drops[key] <= 0) return;
		drops[key]--;
		won = false;
	}

	function resetMix(): void {
		drops = { red: 0, yellow: 0, blue: 0, white: 0, black: 0 };
		won = false;
		showHint = false;
	}

	function mixedRgb(): [number, number, number] {
		const total = totalDrops();
		if (total === 0) return [255, 255, 255];

		let C = 0, M = 0, Y = 0;
		for (const paint of PAINTS) {
			const d = drops[paint.key];
			C += d * paint.cmy[0];
			M += d * paint.cmy[1];
			Y += d * paint.cmy[2];
		}
		C /= total;
		M /= total;
		Y /= total;

		return [
			Math.round((1 - C) * 255),
			Math.round((1 - M) * 255),
			Math.round((1 - Y) * 255),
		];
	}

	function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
		r /= 255; g /= 255; b /= 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const l = (max + min) / 2;
		if (max === min) return [0, 0, l * 100];
		const d = max - min;
		const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		let h = 0;
		switch (max) {
			case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
			case g: h = ((b - r) / d + 2) / 6; break;
			case b: h = ((r - g) / d + 4) / 6; break;
		}
		return [h * 360, s * 100, l * 100];
	}

	function hueLabel(h: number): string {
		if (h < 15)  return 'Red';
		if (h < 40)  return 'Orange';
		if (h < 65)  return 'Yellow';
		if (h < 150) return 'Green';
		if (h < 195) return 'Teal';
		if (h < 260) return 'Blue';
		if (h < 315) return 'Purple';  // extended to catch Red+Blue mix at ~300°
		if (h < 345) return 'Pink';
		return 'Red';
	}

	function colorName(rgb: [number, number, number]): string {
		const [r, g, b] = rgb;
		const [h, s, l] = rgbToHsl(r, g, b);
		if (l > 96) return 'White';
		if (l < 5)  return 'Black';
		if (s < 8)  {
			if (l < 30) return 'Dark Gray';
			if (l > 75) return 'Light Gray';
			return 'Gray';
		}
		// Pink: near-red hue with high lightness (e.g. Red + White mix)
		if ((h < 20 || h > 340) && l > 60 && s > 40) return 'Pink';
		// Brown: warm orange hue with lowered lightness and moderate saturation
		if (h >= 10 && h < 45 && l < 52 && s >= 30 && s < 88) return 'Brown';
		const base = hueLabel(h);
		if (l < 20) return 'Dark ' + base;
		if (l > 78) return 'Light ' + base;
		if (s < 25) return 'Muted ' + base;
		return base;
	}

	function colorDistance(a: [number, number, number], b: [number, number, number]): number {
		const dR = a[0] - b[0];
		const dG = a[1] - b[1];
		const dB = a[2] - b[2];
		return Math.sqrt((dR * dR + dG * dG + dB * dB) / 3);
	}

	function matchPercent(a: [number, number, number], b: [number, number, number]): number {
		return Math.max(0, Math.round(100 * (1 - colorDistance(a, b) / 255)));
	}

	function checkWin(): void {
		if (mode !== 'challenge') return;
		const target = CHALLENGES[challengeIndex].target;
		const pct = matchPercent(mixedRgb(), target);
		if (pct >= 85 && !won) {
			won = true;
			triggerConfetti();
		}
	}

	function triggerConfetti(): void {
		if (confettiTimer) clearTimeout(confettiTimer);
		confettiActive = true;
		confettiTimer = setTimeout(() => { confettiActive = false; }, 3000);
	}

	function nextChallenge(): void {
		if (challengeIndex === CHALLENGES.length - 1) {
			allDone = true;
		} else {
			challengeIndex++;
		}
		resetMix();
	}

	function restartChallenges(): void {
		allDone = false;
		challengeIndex = 0;
		resetMix();
	}

	function switchMode(m: Mode): void {
		mode = m;
		resetMix();
		challengeIndex = 0;
	}

	function rgbString(rgb: [number, number, number]): string {
		return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
	}

	// Reactive derived values
	let mixed = $derived(mixedRgb());
	let name = $derived(colorName(mixed));
	let currentChallenge = $derived(CHALLENGES[challengeIndex]);
	let pct = $derived(mode === 'challenge' ? matchPercent(mixed, currentChallenge.target) : 0);
</script>

<div class="page">
	<!-- Confetti overlay -->
	{#if confettiActive}
		<div class="confetti-overlay" aria-hidden="true">
			{#each Array(30) as _, i}
				<div
					class="confetti-piece"
					style="
						left: {Math.random() * 100}%;
						animation-delay: {Math.random() * 1}s;
						background: hsl({Math.random() * 360}, 90%, 60%);
					"
				></div>
			{/each}
		</div>
	{/if}

	<div class="header">
		<a href="/" class="back-btn">← Home</a>
		<h1>🎨 Color Mixer</h1>
		<div class="mode-tabs">
			<button class="tab-btn" class:active={mode === 'free'} onclick={() => switchMode('free')}>
				Free Mix
			</button>
			<button class="tab-btn" class:active={mode === 'challenge'} onclick={() => switchMode('challenge')}>
				Challenge
			</button>
		</div>
	</div>

	<div class="main">
		<!-- Paint jars -->
		<div class="paints-section">
			<h2>Paint Jars</h2>
			<div class="paints-grid">
				{#each PAINTS as paint}
					<div class="paint-jar">
						<div class="jar-circle" style="background: {paint.rgb}; border-color: {paint.rgb};">
							<span class="jar-drops">{drops[paint.key]}</span>
						</div>
						<div class="jar-label">{paint.label}</div>
						<div class="jar-controls">
							<button
								class="drop-btn minus"
								onclick={() => removeDrop(paint.key)}
								disabled={drops[paint.key] === 0}
								aria-label="Remove {paint.label} drop"
							>−</button>
							<span class="drop-count">{drops[paint.key]}</span>
							<button
								class="drop-btn plus"
								onclick={() => addDrop(paint.key)}
								disabled={drops[paint.key] >= MAX_DROPS_PER || totalDrops() >= MAX_DROPS_TOTAL}
								aria-label="Add {paint.label} drop"
							>+</button>
						</div>
					</div>
				{/each}
			</div>
			<div class="total-drops">
				{totalDrops()} / {MAX_DROPS_TOTAL} drops used
			</div>
			<button class="reset-btn" onclick={resetMix}>Reset</button>
		</div>

		<!-- Mixing bowl -->
		<div class="bowl-section">
			{#if mode === 'challenge' && allDone}
				<div class="all-done-banner">
					<div class="all-done-title">🏆 You mixed all {CHALLENGES.length} colors!</div>
					<p class="all-done-msg">Amazing work! You're a color mixing expert!</p>
					<button class="next-btn" onclick={restartChallenges}>Play Again →</button>
				</div>
			{:else if mode === 'challenge'}
				<div class="challenge-header">
					<span class="level-badge">Level {challengeIndex + 1} / {CHALLENGES.length}</span>
					<h2>Mix: <span class="challenge-name">{currentChallenge.name}</span></h2>
				</div>

				<div class="target-and-bowl">
					<div class="color-swatch-group">
						<div
							class="color-swatch target-swatch"
							style="background: rgb({currentChallenge.target[0]}, {currentChallenge.target[1]}, {currentChallenge.target[2]});"
						>
							<span class="swatch-label">Target</span>
						</div>
						<div class="vs-label">→</div>
						<div class="color-swatch your-swatch" style="background: {rgbString(mixed)};">
							<span class="swatch-label">Your Mix</span>
						</div>
					</div>

					<div class="match-bar-container">
						<div class="match-bar-bg">
							<div
								class="match-bar-fill"
								style="width: {pct}%; background: {pct >= 85 ? '#2ecc71' : pct >= 60 ? '#f39c12' : '#e74c3c'};"
							></div>
						</div>
						<div class="match-label">{pct}% match</div>
					</div>

					{#if won}
						<div class="win-banner">
							🎉 You mixed {currentChallenge.name}!
							<button class="next-btn" onclick={nextChallenge}>
								Next Color →
							</button>
						</div>
					{/if}

					<button class="hint-btn" onclick={() => showHint = !showHint}>
						{showHint ? 'Hide Hint' : 'Show Hint 💡'}
					</button>
					{#if showHint}
						<p class="hint-text">{currentChallenge.hint}</p>
					{/if}
				</div>
			{:else}
				<h2>Your Mix</h2>
			{/if}

			<div class="bowl-wrapper">
				<div class="mixing-bowl" style="background: {rgbString(mixed)};">
					{#if totalDrops() === 0}
						<span class="bowl-empty-text">Add drops!</span>
					{/if}
				</div>
				<div class="color-name">{name}</div>
				<div class="color-hex">
					rgb({mixed[0]}, {mixed[1]}, {mixed[2]})
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Segoe UI', system-ui, sans-serif;
		background: #1a1a2e;
		color: #eee;
		min-height: 100vh;
	}

	.page {
		min-height: 100vh;
		background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
		padding: 0 0 2rem;
		position: relative;
		overflow-x: hidden;
	}

	/* Confetti */
	.confetti-overlay {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 100;
		overflow: hidden;
	}
	.confetti-piece {
		position: absolute;
		top: -20px;
		width: 10px;
		height: 14px;
		border-radius: 2px;
		animation: fall 2.5s ease-in forwards;
	}
	@keyframes fall {
		0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
		100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
	}

	/* Header */
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		background: rgba(255,255,255,0.05);
		border-bottom: 1px solid rgba(255,255,255,0.1);
		flex-wrap: wrap;
		gap: 0.75rem;
	}

	.back-btn {
		color: #aaa;
		text-decoration: none;
		font-size: 0.95rem;
		transition: color 0.2s;
	}
	.back-btn:hover { color: #fff; }

	h1 {
		margin: 0;
		font-size: 1.6rem;
		font-weight: 800;
		letter-spacing: -0.5px;
		color: #fff;
		text-shadow: 0 0 20px rgba(255,200,0,0.4);
	}

	.mode-tabs {
		display: flex;
		gap: 0.5rem;
	}
	.tab-btn {
		padding: 0.45rem 1.2rem;
		border-radius: 999px;
		border: 2px solid rgba(255,255,255,0.2);
		background: transparent;
		color: #ccc;
		cursor: pointer;
		font-size: 0.95rem;
		font-weight: 600;
		transition: all 0.2s;
	}
	.tab-btn:hover { border-color: rgba(255,255,255,0.5); color: #fff; }
	.tab-btn.active {
		background: rgba(255,255,255,0.15);
		border-color: rgba(255,255,255,0.6);
		color: #fff;
	}

	/* Main layout */
	.main {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		padding: 2rem 2rem 0;
		max-width: 900px;
		margin: 0 auto;
	}

	@media (max-width: 680px) {
		.main {
			grid-template-columns: 1fr;
			padding: 1rem;
		}
	}

	h2 {
		margin: 0 0 1rem;
		font-size: 1.1rem;
		text-transform: uppercase;
		letter-spacing: 1px;
		color: rgba(255,255,255,0.6);
		font-weight: 700;
	}

	/* Paints */
	.paints-section {
		background: rgba(255,255,255,0.05);
		border-radius: 16px;
		padding: 1.5rem;
		border: 1px solid rgba(255,255,255,0.08);
	}

	.paints-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	@media (max-width: 480px) {
		.paints-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.paint-jar {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
	}

	.jar-circle {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		border: 3px solid;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 12px rgba(0,0,0,0.4);
		position: relative;
	}

	.jar-drops {
		font-size: 1.1rem;
		font-weight: 800;
		color: rgba(255,255,255,0.9);
		text-shadow: 0 1px 3px rgba(0,0,0,0.7);
	}

	.jar-label {
		font-size: 0.72rem;
		font-weight: 600;
		color: rgba(255,255,255,0.7);
		text-align: center;
	}

	.jar-controls {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.drop-btn {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: none;
		cursor: pointer;
		font-size: 1.1rem;
		font-weight: 700;
		line-height: 1;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.drop-btn.plus  { background: #2ecc71; color: #fff; }
	.drop-btn.minus { background: #e74c3c; color: #fff; }
	.drop-btn:hover:not(:disabled) { transform: scale(1.15); }
	.drop-btn:disabled { opacity: 0.3; cursor: not-allowed; }

	.drop-count {
		font-size: 0.8rem;
		font-weight: 700;
		color: #fff;
		min-width: 14px;
		text-align: center;
	}

	.total-drops {
		font-size: 0.8rem;
		color: rgba(255,255,255,0.4);
		margin-bottom: 0.75rem;
		text-align: center;
	}

	.reset-btn {
		display: block;
		width: 100%;
		padding: 0.6rem;
		background: rgba(255,255,255,0.08);
		border: 1px solid rgba(255,255,255,0.15);
		border-radius: 8px;
		color: #ccc;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}
	.reset-btn:hover {
		background: rgba(255,255,255,0.15);
		color: #fff;
	}

	/* Bowl section */
	.bowl-section {
		background: rgba(255,255,255,0.05);
		border-radius: 16px;
		padding: 1.5rem;
		border: 1px solid rgba(255,255,255,0.08);
		display: flex;
		flex-direction: column;
	}

	.challenge-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.level-badge {
		background: rgba(255,200,0,0.2);
		border: 1px solid rgba(255,200,0,0.4);
		color: #ffd700;
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.5px;
	}

	.challenge-header h2 {
		margin: 0;
	}

	.challenge-name {
		color: #fff;
		font-size: 1.2rem;
	}

	.target-and-bowl {
		margin-bottom: 1rem;
	}

	.color-swatch-group {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.color-swatch {
		width: 80px;
		height: 60px;
		border-radius: 10px;
		box-shadow: 0 4px 14px rgba(0,0,0,0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 4px;
		transition: background 0.3s ease;
	}

	.swatch-label {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		color: rgba(255,255,255,0.8);
		text-shadow: 0 1px 3px rgba(0,0,0,0.8);
		letter-spacing: 0.5px;
	}

	.vs-label {
		font-size: 1.4rem;
		color: rgba(255,255,255,0.4);
	}

	.match-bar-container {
		margin-bottom: 0.75rem;
	}

	.match-bar-bg {
		height: 14px;
		background: rgba(255,255,255,0.1);
		border-radius: 999px;
		overflow: hidden;
		margin-bottom: 0.3rem;
	}

	.match-bar-fill {
		height: 100%;
		border-radius: 999px;
		transition: width 0.3s ease, background 0.3s ease;
	}

	.match-label {
		font-size: 0.85rem;
		font-weight: 700;
		color: rgba(255,255,255,0.7);
		text-align: right;
	}

	.all-done-banner {
		background: linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,160,0,0.2));
		border: 1px solid rgba(255,215,0,0.5);
		border-radius: 14px;
		padding: 1.25rem 1.25rem 1rem;
		text-align: center;
		margin-bottom: 1rem;
	}

	.all-done-title {
		font-size: 1.25rem;
		font-weight: 800;
		color: #ffd700;
		margin-bottom: 0.4rem;
	}

	.all-done-msg {
		font-size: 0.9rem;
		color: rgba(255,255,255,0.7);
		margin: 0 0 0.75rem;
	}

	.win-banner {
		background: linear-gradient(135deg, rgba(46,204,113,0.2), rgba(39,174,96,0.3));
		border: 1px solid rgba(46,204,113,0.5);
		border-radius: 12px;
		padding: 0.75rem 1rem;
		margin-bottom: 0.75rem;
		font-size: 1rem;
		font-weight: 700;
		color: #2ecc71;
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.next-btn {
		background: #2ecc71;
		border: none;
		border-radius: 8px;
		color: #fff;
		font-size: 0.9rem;
		font-weight: 700;
		padding: 0.4rem 1rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	.next-btn:hover { background: #27ae60; transform: translateX(2px); }

	.hint-btn {
		background: rgba(255,200,0,0.1);
		border: 1px solid rgba(255,200,0,0.3);
		border-radius: 8px;
		color: #ffd700;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.4rem 0.8rem;
		cursor: pointer;
		transition: all 0.2s;
		margin-bottom: 0.5rem;
	}
	.hint-btn:hover {
		background: rgba(255,200,0,0.2);
	}

	.hint-text {
		font-size: 0.88rem;
		color: rgba(255,255,255,0.65);
		margin: 0 0 0.75rem;
		font-style: italic;
	}

	/* Bowl */
	.bowl-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin-top: auto;
		padding-top: 1rem;
	}

	.mixing-bowl {
		width: 160px;
		height: 160px;
		border-radius: 50%;
		box-shadow:
			0 0 40px rgba(0,0,0,0.6),
			inset 0 -8px 20px rgba(0,0,0,0.3),
			inset 0 8px 20px rgba(255,255,255,0.15);
		transition: background 0.35s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1rem;
		border: 4px solid rgba(255,255,255,0.15);
	}

	.bowl-empty-text {
		font-size: 0.75rem;
		font-weight: 700;
		color: rgba(0,0,0,0.3);
		text-transform: uppercase;
		letter-spacing: 1px;
	}

	.color-name {
		font-size: 1.4rem;
		font-weight: 800;
		color: #fff;
		margin-bottom: 0.25rem;
		text-align: center;
	}

	.color-hex {
		font-size: 0.8rem;
		color: rgba(255,255,255,0.35);
		font-family: monospace;
		text-align: center;
	}
</style>
