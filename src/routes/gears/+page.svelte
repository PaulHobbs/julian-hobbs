<script lang="ts">
	import { onMount } from 'svelte';

	// --- Types ---
	type GearType = 'motor' | 'gear' | 'sheep' | 'slow-motor' | 'flywheel';
	type PaletteItem = { type: GearType; teeth: number; label: string; color: string };
	type Gear = {
		id: number;
		type: GearType;
		teeth: number;
		x: number;
		y: number;
		angle: number;
		rpm: number;
		direction: number; // 1 = CW, -1 = CCW, 0 = unpowered
		color: string;
		jammed: boolean;
		label: string;
		level: number; // 1 or 2
	};

	// --- Constants ---
	const MODULE = 5;
	const MOTOR_RPM = 60;
	const SLOW_MOTOR_RPM = 15;
	const SNAP_TOLERANCE = 15;
	const PALETTE_ITEMS: PaletteItem[] = [
		{ type: 'motor', teeth: 12, label: 'Motor', color: '#e74c3c' },
		{ type: 'slow-motor', teeth: 48, label: 'Giant Motor', color: '#c0392b' },
		{ type: 'sheep', teeth: 20, label: 'Sheep', color: '#f5f0e1' },
		{ type: 'gear', teeth: 12, label: '12T', color: 'rgb(230 225 97)' },
		{ type: 'gear', teeth: 16, label: '16T', color: '#27ae60' },
		{ type: 'gear', teeth: 20, label: '20T', color: '#3498db' },
		{ type: 'gear', teeth: 24, label: '24T', color: '#2980b9' },
		{ type: 'gear', teeth: 32, label: '32T', color: '#e67e22' },
		{ type: 'gear', teeth: 38, label: '38T', color: '#1abc9c' },
		{ type: 'gear', teeth: 48, label: '48T', color: '#9b59b6' },
		{ type: 'flywheel', teeth: 60, label: 'Flywheel', color: '#7f8c8d' },
	];

	function pitchRadius(teeth: number): number {
		return (teeth * MODULE) / 2;
	}

	function isMotorType(type: GearType): boolean {
		return type === 'motor' || type === 'slow-motor';
	}

	function getMotorRpm(type: GearType): number {
		return type === 'slow-motor' ? SLOW_MOTOR_RPM : MOTOR_RPM;
	}

	// --- State ---
	let canvasEl: HTMLCanvasElement | undefined = $state(undefined);
	let gears: Gear[] = $state([]);
	let nextId = $state(1);
	let selectedGearId: number | null = $state(null);
	let playing = $state(true);
	let darkMode = $state(true);
	let activeLevel = $state(1);
	let animFrameId = 0;
	let lastTime = 0;

	// Drag state
	let dragging = $state(false);
	let dragGear: Gear | null = $state(null);
	let dragFromPalette: PaletteItem | null = $state(null);
	let dragOffsetX = 0;
	let dragOffsetY = 0;
	let dragX = $state(0);
	let dragY = $state(0);

	// Canvas sizing
	let containerEl: HTMLDivElement | undefined = $state(undefined);
	let canvasWidth = $state(800);
	let canvasHeight = $state(500);

	let selectedGear = $derived(gears.find(g => g.id === selectedGearId) ?? null);

	// --- Gear meshing ---
	function meshDistance(g1: Gear, g2: Gear): number {
		return pitchRadius(g1.teeth) + pitchRadius(g2.teeth);
	}

	function actualDistance(g1: Gear, g2: Gear): number {
		const dx = g1.x - g2.x;
		const dy = g1.y - g2.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	function areMeshed(g1: Gear, g2: Gear): boolean {
		if (g1.level !== g2.level) return false;
		const ideal = meshDistance(g1, g2);
		const actual = actualDistance(g1, g2);
		return Math.abs(actual - ideal) < 3;
	}

	/** Check if two gears share the same axle (same position, different levels) */
	function areAxleConnected(g1: Gear, g2: Gear): boolean {
		if (g1.level === g2.level) return false;
		const dx = g1.x - g2.x;
		const dy = g1.y - g2.y;
		return Math.sqrt(dx * dx + dy * dy) < 3;
	}

	// --- Snap logic ---
	function findSnapPosition(gear: { teeth: number }, x: number, y: number, excludeId: number, level: number): { x: number; y: number; snapTo: Gear } | null {
		let bestSnap: { x: number; y: number; snapTo: Gear } | null = null;
		let bestDist = Infinity;

		for (const other of gears) {
			if (other.id === excludeId) continue;
			if (other.level !== level) continue;
			const ideal = pitchRadius(gear.teeth) + pitchRadius(other.teeth);
			const dx = x - other.x;
			const dy = y - other.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (Math.abs(dist - ideal) < SNAP_TOLERANCE + ideal * 0.3) {
				// Check overlap: can't be closer than sum of outer radii minus a tooth
				const outerSum = pitchRadius(gear.teeth) + pitchRadius(other.teeth);
				if (dist < outerSum * 0.5) continue;

				const snapDist = Math.abs(dist - ideal);
				if (snapDist < bestDist) {
					bestDist = snapDist;
					const angle = Math.atan2(dy, dx);
					bestSnap = {
						x: other.x + Math.cos(angle) * ideal,
						y: other.y + Math.sin(angle) * ideal,
						snapTo: other,
					};
				}
			}
		}
		return bestSnap;
	}

	/** Find a gear on the OTHER level near (x,y) that we could axle-connect to */
	function findAxleSnapTarget(x: number, y: number, excludeId: number, currentLevel: number): Gear | null {
		const AXLE_SNAP_DIST = 25;
		let best: Gear | null = null;
		let bestDist = Infinity;
		for (const other of gears) {
			if (other.id === excludeId) continue;
			if (other.level === currentLevel) continue;
			const dx = x - other.x;
			const dy = y - other.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < AXLE_SNAP_DIST && dist < bestDist) {
				bestDist = dist;
				best = other;
			}
		}
		return best;
	}

	// Check if placing at (x,y) would overlap any existing gear on same level (excluding excludeId)
	function wouldOverlap(teeth: number, x: number, y: number, excludeId: number, level: number): boolean {
		const r = pitchRadius(teeth);
		for (const other of gears) {
			if (other.id === excludeId) continue;
			if (other.level !== level) continue;
			const otherR = pitchRadius(other.teeth);
			const dx = x - other.x;
			const dy = y - other.y;
			const dist = Math.sqrt(dx * dx + dy * dy);
			const minDist = (r + otherR) * 0.8;
			const meshDist = r + otherR;
			// Allow if it's at mesh distance (within tolerance), reject if overlapping
			if (dist < minDist && Math.abs(dist - meshDist) > 3) return true;
		}
		return false;
	}

	// --- BFS propagation for RPM/direction ---
	function propagateMotion(): void {
		// Reset all
		for (const g of gears) {
			g.rpm = 0;
			g.direction = 0;
			g.jammed = false;
		}

		// Build adjacency: meshing (same level, opposite dir) + axle (cross level, same dir)
		const adj = new Map<number, { id: number; type: 'mesh' | 'axle' }[]>();
		for (const g of gears) adj.set(g.id, []);
		for (let i = 0; i < gears.length; i++) {
			for (let j = i + 1; j < gears.length; j++) {
				if (areMeshed(gears[i], gears[j])) {
					adj.get(gears[i].id)!.push({ id: gears[j].id, type: 'mesh' });
					adj.get(gears[j].id)!.push({ id: gears[i].id, type: 'mesh' });
				} else if (areAxleConnected(gears[i], gears[j])) {
					adj.get(gears[i].id)!.push({ id: gears[j].id, type: 'axle' });
					adj.get(gears[j].id)!.push({ id: gears[i].id, type: 'axle' });
				}
			}
		}

		// Find motors
		const motors = gears.filter(g => isMotorType(g.type));

		// BFS from each motor
		const visited = new Set<number>();
		const gearMap = new Map<number, Gear>();
		for (const g of gears) gearMap.set(g.id, g);

		for (const motor of motors) {
			if (visited.has(motor.id)) continue;
			motor.rpm = getMotorRpm(motor.type);
			motor.direction = 1;

			const queue: number[] = [motor.id];
			visited.add(motor.id);

			while (queue.length > 0) {
				const currentId = queue.shift()!;
				const current = gearMap.get(currentId)!;

				for (const link of adj.get(currentId)!) {
					const neighbor = gearMap.get(link.id)!;

					let expectedDir: number;
					let expectedRpm: number;

					if (link.type === 'mesh') {
						// Meshing: opposite direction, RPM scales by gear ratio
						expectedDir = -current.direction;
						expectedRpm = (current.rpm * current.teeth) / neighbor.teeth;
					} else {
						// Axle: same direction, same RPM (rigid connection)
						expectedDir = current.direction;
						expectedRpm = current.rpm;
					}

					if (visited.has(link.id)) {
						// Check for jam: if already visited with different direction
						if (neighbor.direction !== expectedDir) {
							markJammed(motor.id, adj, gearMap);
						}
						continue;
					}

					neighbor.direction = expectedDir;
					neighbor.rpm = expectedRpm;
					visited.add(link.id);
					queue.push(link.id);
				}
			}
		}
	}

	function markJammed(startId: number, adj: Map<number, { id: number; type: string }[]>, gearMap: Map<number, Gear>): void {
		const visited = new Set<number>();
		const queue = [startId];
		visited.add(startId);
		while (queue.length > 0) {
			const id = queue.shift()!;
			const gear = gearMap.get(id)!;
			gear.jammed = true;
			gear.rpm = 0;
			gear.direction = 0;
			for (const link of adj.get(id)!) {
				if (!visited.has(link.id)) {
					visited.add(link.id);
					queue.push(link.id);
				}
			}
		}
	}

	// --- Canvas drawing ---
	function drawGear(ctx: CanvasRenderingContext2D, gear: Gear, isSelected: boolean, alpha: number = 1): void {
		const pr = pitchRadius(gear.teeth);
		const outerR = pr + MODULE * 0.8;
		const innerR = pr - MODULE * 0.8;
		const toothCount = gear.teeth;

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.translate(gear.x, gear.y);
		ctx.rotate(gear.angle);

		// Glow effect for fast-spinning gears
		if (Math.abs(gear.rpm) > 100 && !gear.jammed && alpha > 0.5) {
			const glowIntensity = Math.min((Math.abs(gear.rpm) - 100) / 200, 1);
			ctx.shadowColor = gear.color;
			ctx.shadowBlur = 15 + glowIntensity * 20;
		}

		// Draw gear body with teeth
		ctx.beginPath();
		for (let i = 0; i < toothCount; i++) {
			const a0 = (i / toothCount) * Math.PI * 2;
			const a1 = ((i + 0.15) / toothCount) * Math.PI * 2;
			const a2 = ((i + 0.35) / toothCount) * Math.PI * 2;
			const a3 = ((i + 0.5) / toothCount) * Math.PI * 2;
			const a4 = ((i + 0.65) / toothCount) * Math.PI * 2;
			const a5 = ((i + 0.85) / toothCount) * Math.PI * 2;

			if (i === 0) {
				ctx.moveTo(Math.cos(a0) * innerR, Math.sin(a0) * innerR);
			}
			// Rising edge
			ctx.lineTo(Math.cos(a1) * innerR, Math.sin(a1) * innerR);
			ctx.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
			// Tooth top
			ctx.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
			// Falling edge
			ctx.lineTo(Math.cos(a4) * outerR, Math.sin(a4) * outerR);
			ctx.lineTo(Math.cos(a5) * innerR, Math.sin(a5) * innerR);
			// Valley
			const aNext = ((i + 1) / toothCount) * Math.PI * 2;
			ctx.lineTo(Math.cos(aNext) * innerR, Math.sin(aNext) * innerR);
		}
		ctx.closePath();

		const fillColor = gear.jammed ? '#555' : gear.color;
		ctx.fillStyle = fillColor;
		ctx.fill();
		ctx.strokeStyle = gear.jammed ? '#333' : darkenColor(gear.color, 0.3);
		ctx.lineWidth = 2;
		ctx.stroke();

		ctx.shadowBlur = 0;

		// Center hub
		ctx.beginPath();
		ctx.arc(0, 0, Math.max(pr * 0.25, 8), 0, Math.PI * 2);
		ctx.fillStyle = gear.jammed ? '#444' : darkenColor(gear.color, 0.2);
		ctx.fill();
		ctx.strokeStyle = gear.jammed ? '#333' : darkenColor(gear.color, 0.4);
		ctx.lineWidth = 2;
		ctx.stroke();

		// Axle hole
		ctx.beginPath();
		ctx.arc(0, 0, Math.max(pr * 0.08, 3), 0, Math.PI * 2);
		ctx.fillStyle = darkMode ? '#1a1a3e' : '#ccc';
		ctx.fill();

		// Motor indicator
		if (gear.type === 'motor' && !gear.jammed) {
			ctx.fillStyle = '#fff';
			ctx.font = `bold ${Math.max(pr * 0.35, 10)}px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('⚡', 0, 0);
		}

		// Slow motor indicator
		if (gear.type === 'slow-motor' && !gear.jammed) {
			ctx.fillStyle = '#fff';
			ctx.font = `bold ${Math.max(pr * 0.25, 10)}px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('⚡', 0, -pr * 0.08);
			ctx.font = `${Math.max(pr * 0.12, 7)}px sans-serif`;
			ctx.fillText('SLOW', 0, pr * 0.12);
		}

		// Sheep indicator
		if (gear.type === 'sheep' && !gear.jammed) {
			ctx.fillStyle = '#333';
			ctx.font = `${Math.max(pr * 0.5, 12)}px sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('🐑', 0, 1);
		}

		// Flywheel indicator - heavy rim ring and center weight
		if (gear.type === 'flywheel') {
			// Thick outer rim to indicate mass
			ctx.beginPath();
			ctx.arc(0, 0, pr - MODULE * 0.2, 0, Math.PI * 2);
			ctx.strokeStyle = gear.jammed ? '#333' : darkenColor(gear.color, 0.4);
			ctx.lineWidth = MODULE * 1.5;
			ctx.stroke();

			// Spokes
			const spokeCount = 6;
			const hubR = Math.max(pr * 0.25, 8);
			const rimInner = pr - MODULE * 1.0;
			ctx.strokeStyle = gear.jammed ? '#444' : darkenColor(gear.color, 0.15);
			ctx.lineWidth = 3;
			for (let s = 0; s < spokeCount; s++) {
				const a = (s / spokeCount) * Math.PI * 2;
				ctx.beginPath();
				ctx.moveTo(Math.cos(a) * hubR, Math.sin(a) * hubR);
				ctx.lineTo(Math.cos(a) * rimInner, Math.sin(a) * rimInner);
				ctx.stroke();
			}

			// Label
			if (!gear.jammed) {
				ctx.fillStyle = '#fff';
				ctx.font = `bold ${Math.max(pr * 0.13, 8)}px sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText('FW', 0, 0);
			}
		}

		ctx.restore();

		// Selection ring
		if (isSelected) {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.translate(gear.x, gear.y);
			ctx.beginPath();
			ctx.arc(0, 0, outerR + 6, 0, Math.PI * 2);
			ctx.strokeStyle = '#f1c40f';
			ctx.lineWidth = 3;
			ctx.setLineDash([6, 4]);
			ctx.stroke();
			ctx.setLineDash([]);
			ctx.restore();
		}

		// Direction arrow (when spinning)
		if (gear.direction !== 0 && !gear.jammed && playing && alpha > 0.5) {
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.translate(gear.x, gear.y);
			const arrowR = outerR + 12;
			const arrowAngle = gear.angle + (gear.direction > 0 ? 0 : Math.PI);
			ctx.beginPath();
			ctx.arc(0, 0, arrowR, arrowAngle - 0.3, arrowAngle + 0.3);
			ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
			ctx.lineWidth = 2;
			ctx.stroke();
			// Arrowhead
			const tipX = Math.cos(arrowAngle + 0.3 * gear.direction) * arrowR;
			const tipY = Math.sin(arrowAngle + 0.3 * gear.direction) * arrowR;
			ctx.beginPath();
			ctx.moveTo(tipX, tipY);
			const perpAngle = arrowAngle + 0.3 * gear.direction + Math.PI / 2 * gear.direction;
			ctx.lineTo(tipX + Math.cos(perpAngle) * 6, tipY + Math.sin(perpAngle) * 6);
			ctx.lineTo(tipX + Math.cos(arrowAngle + 0.3 * gear.direction) * 8, tipY + Math.sin(arrowAngle + 0.3 * gear.direction) * 8);
			ctx.fillStyle = darkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)';
			ctx.fill();
			ctx.restore();
		}
	}

	function darkenColor(hex: string, amount: number): string {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		return `rgb(${Math.round(r * (1 - amount))}, ${Math.round(g * (1 - amount))}, ${Math.round(b * (1 - amount))})`;
	}

	function drawCanvas(): void {
		if (!canvasEl) return;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		// Clear
		ctx.clearRect(0, 0, canvasWidth, canvasHeight);

		// Background grid
		ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
		ctx.lineWidth = 1;
		const gridSize = 40;
		for (let x = 0; x < canvasWidth; x += gridSize) {
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvasHeight);
			ctx.stroke();
		}
		for (let y = 0; y < canvasHeight; y += gridSize) {
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(canvasWidth, y);
			ctx.stroke();
		}

		const inactiveLevel = activeLevel === 1 ? 2 : 1;
		const inactiveGears = gears.filter(g => g.level === inactiveLevel);
		const activeGears = gears.filter(g => g.level === activeLevel);

		// Draw inactive level mesh connections (desaturated)
		ctx.save();
		ctx.filter = 'saturate(0.2)';
		for (let i = 0; i < inactiveGears.length; i++) {
			for (let j = i + 1; j < inactiveGears.length; j++) {
				if (areMeshed(inactiveGears[i], inactiveGears[j])) {
					ctx.beginPath();
					ctx.moveTo(inactiveGears[i].x, inactiveGears[i].y);
					ctx.lineTo(inactiveGears[j].x, inactiveGears[j].y);
					ctx.strokeStyle = inactiveGears[i].jammed ? 'rgba(255,0,0,0.1)' : darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
					ctx.lineWidth = 2;
					ctx.setLineDash([4, 4]);
					ctx.stroke();
					ctx.setLineDash([]);
				}
			}
		}

		// Draw inactive level gears (desaturated + transparent)
		for (const gear of inactiveGears) {
			drawGear(ctx, gear, false, 0.25);
		}
		ctx.restore();

		// Draw axle connection indicators (between levels)
		for (const ag of activeGears) {
			for (const ig of inactiveGears) {
				if (areAxleConnected(ag, ig)) {
					ctx.save();
					ctx.beginPath();
					const r = Math.max(pitchRadius(ag.teeth), pitchRadius(ig.teeth)) * 0.15;
					ctx.arc(ag.x, ag.y, r + 4, 0, Math.PI * 2);
					ctx.strokeStyle = '#f39c12';
					ctx.lineWidth = 2;
					ctx.setLineDash([3, 3]);
					ctx.stroke();
					ctx.setLineDash([]);
					// Draw a small "axle" indicator
					ctx.beginPath();
					ctx.arc(ag.x, ag.y, 3, 0, Math.PI * 2);
					ctx.fillStyle = '#f39c12';
					ctx.fill();
					ctx.restore();
				}
			}
		}

		// Draw active level mesh connections
		for (let i = 0; i < activeGears.length; i++) {
			for (let j = i + 1; j < activeGears.length; j++) {
				if (areMeshed(activeGears[i], activeGears[j])) {
					ctx.beginPath();
					ctx.moveTo(activeGears[i].x, activeGears[i].y);
					ctx.lineTo(activeGears[j].x, activeGears[j].y);
					ctx.strokeStyle = activeGears[i].jammed ? 'rgba(255,0,0,0.3)' : darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)';
					ctx.lineWidth = 2;
					ctx.setLineDash([4, 4]);
					ctx.stroke();
					ctx.setLineDash([]);
				}
			}
		}

		// Draw active level gears
		for (const gear of activeGears) {
			drawGear(ctx, gear, gear.id === selectedGearId);
		}

		// Draw drag preview
		if (dragging && (dragGear || dragFromPalette)) {
			const teeth = dragGear ? dragGear.teeth : dragFromPalette!.teeth;
			const color = dragGear ? dragGear.color : dragFromPalette!.color;
			const type = dragGear ? dragGear.type : dragFromPalette!.type;
			const excludeId = dragGear ? dragGear.id : -1;

			let px = dragX;
			let py = dragY;

			// Check for axle snap to other level first
			const axleTarget = findAxleSnapTarget(px, py, excludeId, activeLevel);

			const snap = findSnapPosition({ teeth }, px, py, excludeId, activeLevel);
			if (axleTarget) {
				px = axleTarget.x;
				py = axleTarget.y;
			} else if (snap) {
				px = snap.x;
				py = snap.y;
			}

			const previewGear: Gear = {
				id: -1, type, teeth, x: px, y: py,
				angle: 0, rpm: 0, direction: 0,
				color, jammed: false, label: '',
				level: activeLevel,
			};

			ctx.globalAlpha = 0.5;
			drawGear(ctx, previewGear, false);
			ctx.globalAlpha = 1;

			// Snap indicator
			if (snap && !axleTarget) {
				ctx.beginPath();
				ctx.arc(px, py, pitchRadius(teeth) + MODULE + 4, 0, Math.PI * 2);
				ctx.strokeStyle = '#f1c40f';
				ctx.lineWidth = 2;
				ctx.setLineDash([4, 4]);
				ctx.stroke();
				ctx.setLineDash([]);
			}

			// Axle snap indicator
			if (axleTarget) {
				ctx.beginPath();
				ctx.arc(px, py, pitchRadius(teeth) + MODULE + 4, 0, Math.PI * 2);
				ctx.strokeStyle = '#f39c12';
				ctx.lineWidth = 3;
				ctx.setLineDash([6, 3]);
				ctx.stroke();
				ctx.setLineDash([]);
				// Label
				ctx.fillStyle = '#f39c12';
				ctx.font = 'bold 12px sans-serif';
				ctx.textAlign = 'center';
				ctx.textBaseline = 'bottom';
				ctx.fillText('AXLE LINK', px, py - pitchRadius(teeth) - MODULE - 10);
			}
		}

		// Level indicator on canvas
		ctx.save();
		ctx.fillStyle = darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
		ctx.font = 'bold 13px sans-serif';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.fillText(`Level ${activeLevel}`, 10, 10);
		ctx.fillStyle = darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';
		ctx.font = '11px sans-serif';
		ctx.fillText(`(Level ${inactiveLevel} shown faded)`, 10, 28);
		ctx.restore();
	}

	// --- Animation loop ---
	function animate(time: number): void {
		if (!lastTime) lastTime = time;
		const dt = (time - lastTime) / 1000;
		lastTime = time;

		if (playing) {
			for (const gear of gears) {
				if (gear.direction !== 0 && !gear.jammed) {
					const rps = gear.rpm / 60;
					gear.angle += gear.direction * rps * Math.PI * 2 * dt;
				}
			}
		}

		drawCanvas();
		animFrameId = requestAnimationFrame(animate);
	}

	// --- Pointer event handling ---
	function canvasToLocal(e: PointerEvent): { x: number; y: number } {
		if (!canvasEl) return { x: 0, y: 0 };
		const rect = canvasEl.getBoundingClientRect();
		return {
			x: (e.clientX - rect.left) * (canvasWidth / rect.width),
			y: (e.clientY - rect.top) * (canvasHeight / rect.height),
		};
	}

	function findGearAt(x: number, y: number): Gear | null {
		// Only find gears on the active level
		for (let i = gears.length - 1; i >= 0; i--) {
			const g = gears[i];
			if (g.level !== activeLevel) continue;
			const outerR = pitchRadius(g.teeth) + MODULE;
			const dx = x - g.x;
			const dy = y - g.y;
			if (dx * dx + dy * dy <= outerR * outerR) return g;
		}
		return null;
	}

	function handleCanvasPointerDown(e: PointerEvent): void {
		const pos = canvasToLocal(e);
		const gear = findGearAt(pos.x, pos.y);

		if (gear) {
			e.preventDefault();
			canvasEl?.setPointerCapture(e.pointerId);
			dragging = true;
			dragGear = gear;
			dragFromPalette = null;
			dragOffsetX = pos.x - gear.x;
			dragOffsetY = pos.y - gear.y;
			dragX = pos.x - dragOffsetX;
			dragY = pos.y - dragOffsetY;
			selectedGearId = gear.id;
		} else {
			selectedGearId = null;
		}
	}

	function handleCanvasPointerMove(e: PointerEvent): void {
		if (!dragging) return;
		e.preventDefault();
		const pos = canvasToLocal(e);

		if (dragGear) {
			dragX = pos.x - dragOffsetX;
			dragY = pos.y - dragOffsetY;
		} else if (dragFromPalette) {
			dragX = pos.x;
			dragY = pos.y;
		}
	}

	function handleCanvasPointerUp(e: PointerEvent): void {
		if (!dragging) return;
		e.preventDefault();

		if (dragGear) {
			// Move existing gear
			let newX = dragX;
			let newY = dragY;

			// Check axle snap
			const axleTarget = findAxleSnapTarget(newX, newY, dragGear.id, activeLevel);

			const snap = findSnapPosition({ teeth: dragGear.teeth }, newX, newY, dragGear.id, activeLevel);
			if (axleTarget) {
				newX = axleTarget.x;
				newY = axleTarget.y;
			} else if (snap) {
				newX = snap.x;
				newY = snap.y;
			}
			if (!wouldOverlap(dragGear.teeth, newX, newY, dragGear.id, activeLevel)) {
				dragGear.x = newX;
				dragGear.y = newY;
			}
			propagateMotion();
		} else if (dragFromPalette) {
			// Place new gear from palette
			let newX = dragX;
			let newY = dragY;

			// Check axle snap
			const axleTarget = findAxleSnapTarget(newX, newY, -1, activeLevel);

			const snap = findSnapPosition({ teeth: dragFromPalette.teeth }, newX, newY, -1, activeLevel);
			if (axleTarget) {
				newX = axleTarget.x;
				newY = axleTarget.y;
			} else if (snap) {
				newX = snap.x;
				newY = snap.y;
			}
			// Only place if within canvas bounds
			const pr = pitchRadius(dragFromPalette.teeth);
			if (newX > pr && newX < canvasWidth - pr && newY > pr && newY < canvasHeight - pr) {
				if (!wouldOverlap(dragFromPalette.teeth, newX, newY, -1, activeLevel)) {
					const newGear: Gear = {
						id: nextId++,
						type: dragFromPalette.type,
						teeth: dragFromPalette.teeth,
						x: newX,
						y: newY,
						angle: 0,
						rpm: 0,
						direction: 0,
						color: dragFromPalette.color,
						jammed: false,
						label: dragFromPalette.label,
						level: activeLevel,
					};
					gears = [...gears, newGear];
					selectedGearId = newGear.id;
					propagateMotion();
				}
			}
		}

		dragging = false;
		dragGear = null;
		dragFromPalette = null;
	}

	// --- Palette drag ---
	function handlePalettePointerDown(e: PointerEvent, item: PaletteItem): void {
		e.preventDefault();
		// Capture pointer on canvas so touch move/up events are delivered there
		canvasEl?.setPointerCapture(e.pointerId);
		dragging = true;
		dragFromPalette = item;
		dragGear = null;

		// Convert pointer position to canvas-local coordinates
		if (canvasEl) {
			const rect = canvasEl.getBoundingClientRect();
			dragX = (e.clientX - rect.left) * (canvasWidth / rect.width);
			dragY = (e.clientY - rect.top) * (canvasHeight / rect.height);
		}
		dragOffsetX = 0;
		dragOffsetY = 0;
	}

	function handleGlobalPointerMove(e: PointerEvent): void {
		if (!dragging) return;
		e.preventDefault();

		if (canvasEl) {
			const rect = canvasEl.getBoundingClientRect();
			const x = (e.clientX - rect.left) * (canvasWidth / rect.width);
			const y = (e.clientY - rect.top) * (canvasHeight / rect.height);

			if (dragGear) {
				dragX = x - dragOffsetX;
				dragY = y - dragOffsetY;
			} else {
				dragX = x;
				dragY = y;
			}
		}
	}

	function handleGlobalPointerUp(e: PointerEvent): void {
		if (!dragging) return;
		handleCanvasPointerUp(e);
	}

	// --- Actions ---
	function deleteSelected(): void {
		if (selectedGearId === null) return;
		gears = gears.filter(g => g.id !== selectedGearId);
		selectedGearId = null;
		propagateMotion();
	}

	function clearAll(): void {
		gears = [];
		selectedGearId = null;
		nextId = 1;
	}

	function togglePlay(): void {
		playing = !playing;
	}

	function switchLevel(): void {
		activeLevel = activeLevel === 1 ? 2 : 1;
		selectedGearId = null;
	}

	// --- Resize ---
	function updateCanvasSize(): void {
		if (!containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		canvasWidth = rect.width;
		canvasHeight = Math.max(rect.height, 300);
	}

	function setupCanvas(): void {
		if (!canvasEl) return;
		const dpr = window.devicePixelRatio || 1;
		canvasEl.width = canvasWidth * dpr;
		canvasEl.height = canvasHeight * dpr;
	}

	$effect(() => {
		// Re-setup canvas when size changes
		if (canvasEl && canvasWidth && canvasHeight) {
			setupCanvas();
		}
	});

	onMount(() => {
		updateCanvasSize();
		setupCanvas();
		animFrameId = requestAnimationFrame(animate);

		const resizeHandler = () => {
			updateCanvasSize();
			setupCanvas();
		};
		window.addEventListener('resize', resizeHandler);

		return () => {
			cancelAnimationFrame(animFrameId);
			window.removeEventListener('resize', resizeHandler);
		};
	});
</script>

<svelte:head>
	<title>Gear Train Simulator</title>
</svelte:head>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="page-container" class:light={!darkMode} onpointermove={handleGlobalPointerMove} onpointerup={handleGlobalPointerUp}>
	<div class="header">
		<h1>Gear Train Simulator</h1>
		<div class="controls">
			<button class="ctrl-btn" onclick={togglePlay} title={playing ? 'Pause' : 'Play'}>
				{playing ? '⏸' : '▶️'}
			</button>
			<button class="ctrl-btn level-btn" class:level-active={activeLevel === 1} onclick={() => { activeLevel = 1; selectedGearId = null; }} title="Switch to Level 1">
				L1
			</button>
			<button class="ctrl-btn level-btn" class:level-active={activeLevel === 2} onclick={() => { activeLevel = 2; selectedGearId = null; }} title="Switch to Level 2">
				L2
			</button>
			<button class="ctrl-btn" onclick={deleteSelected} disabled={selectedGearId === null} title="Delete selected">
				🗑️
			</button>
			<button class="ctrl-btn" onclick={clearAll} title="Clear all">
				Clear
			</button>
			<button class="ctrl-btn" onclick={() => darkMode = !darkMode} title={darkMode ? 'Light mode' : 'Dark mode'}>
				{darkMode ? '☀️' : '🌙'}
			</button>
		</div>
	</div>

	<div class="palette">
		{#each PALETTE_ITEMS as item}
			<!-- svelte-ignore a11y_consider_explicit_label -->
			<button
				class="palette-item"
				onpointerdown={(e) => handlePalettePointerDown(e, item)}
			>
				<div class="palette-preview" style:background-color={item.color} style:width="{Math.max(pitchRadius(item.teeth) * 0.8, 16)}px" style:height="{Math.max(pitchRadius(item.teeth) * 0.8, 16)}px">
					{#if item.type === 'motor'}⚡{:else if item.type === 'slow-motor'}⚡{:else if item.type === 'sheep'}🐑{/if}
				</div>
				<span class="palette-label">{item.label}</span>
			</button>
		{/each}
	</div>

	<div class="canvas-container" bind:this={containerEl}>
		<canvas
			bind:this={canvasEl}
			style:width="{canvasWidth}px"
			style:height="{canvasHeight}px"
			onpointerdown={handleCanvasPointerDown}
			onpointermove={handleCanvasPointerMove}
			onpointerup={handleCanvasPointerUp}
		></canvas>
	</div>

	{#if selectedGear}
		<div class="info-panel">
			<div class="info-title">
				{#if selectedGear.type === 'motor'}
					Motor
				{:else if selectedGear.type === 'slow-motor'}
					Giant Motor ⚡
				{:else if selectedGear.type === 'sheep'}
					Sheep 🐑
				{:else if selectedGear.type === 'flywheel'}
					Flywheel ({selectedGear.teeth}T)
				{:else}
					Gear ({selectedGear.teeth}T)
				{/if}
			</div>
			<div class="info-row">
				<span class="info-label">Teeth:</span>
				<span class="info-value">{selectedGear.teeth}</span>
			</div>
			<div class="info-row">
				<span class="info-label">Level:</span>
				<span class="info-value">{selectedGear.level}</span>
			</div>
			<div class="info-row">
				<span class="info-label">RPM:</span>
				<span class="info-value">{selectedGear.jammed ? 'JAMMED' : Math.abs(selectedGear.rpm).toFixed(1)}</span>
			</div>
			<div class="info-row">
				<span class="info-label">Direction:</span>
				<span class="info-value">
					{#if selectedGear.jammed}
						Jammed
					{:else if selectedGear.direction === 1}
						Clockwise ↻
					{:else if selectedGear.direction === -1}
						Counter-CW ↺
					{:else}
						Idle
					{/if}
				</span>
			</div>
			{#if !isMotorType(selectedGear.type) && selectedGear.rpm > 0}
				<div class="info-row">
					<span class="info-label">Ratio:</span>
					<span class="info-value">{(selectedGear.rpm / MOTOR_RPM).toFixed(2)}x</span>
				</div>
			{/if}
			{#if gears.some(g => g.id !== selectedGear!.id && areAxleConnected(g, selectedGear!))}
				<div class="info-row axle-info">
					<span class="info-label">Axle:</span>
					<span class="info-value">Linked to L{selectedGear.level === 1 ? 2 : 1}</span>
				</div>
			{/if}
		</div>
	{/if}

	<div class="instructions">
		Drag components onto the canvas. Gears snap together! Use L1/L2 to switch levels. Drag a gear near a gear on the other level to axle-link them.
	</div>

	<div class="back-link">
		<a href="/">Back to Home</a>
	</div>
</div>

<style>
	.page-container {
		margin: 0 auto;
		padding: 1rem;
		font-family: system-ui, -apple-system, sans-serif;
		min-height: 100vh;
		background: linear-gradient(135deg, #1a1a3e 0%, #2d1b69 50%, #1a1a3e 100%);
		color: #fff;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		display: flex;
		flex-direction: column;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
		flex-shrink: 0;
	}

	h1 {
		font-size: 1.5rem;
		margin: 0;
		background: linear-gradient(90deg, #f1c40f, #e67e22);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.controls {
		display: flex;
		gap: 0.5rem;
	}

	.ctrl-btn {
		background: rgba(255,255,255,0.1);
		border: 1px solid rgba(255,255,255,0.2);
		border-radius: 8px;
		color: #fff;
		padding: 0.4rem 0.8rem;
		cursor: pointer;
		font-size: 1rem;
		transition: background 0.2s;
	}

	.ctrl-btn:hover:not(:disabled) {
		background: rgba(255,255,255,0.2);
	}

	.ctrl-btn:disabled {
		opacity: 0.3;
		cursor: default;
	}

	.level-btn {
		font-weight: 700;
		font-size: 0.85rem;
		min-width: 40px;
		text-align: center;
	}

	.level-active {
		background: rgba(243, 156, 18, 0.4);
		border-color: #f39c12;
		color: #f1c40f;
	}

	.palette {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		overflow-x: auto;
		padding: 0.25rem;
		flex-shrink: 0;
	}

	.palette-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		background: rgba(255,255,255,0.08);
		border: 2px solid rgba(255,255,255,0.15);
		border-radius: 10px;
		padding: 0.5rem 0.75rem;
		cursor: grab;
		transition: all 0.2s;
		color: #fff;
		min-width: 60px;
		touch-action: none;
	}

	.palette-item:hover {
		border-color: rgba(255,255,255,0.4);
		background: rgba(255,255,255,0.12);
	}

	.palette-item:active {
		cursor: grabbing;
		transform: scale(0.95);
	}

	.palette-preview {
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.7rem;
	}

	.palette-label {
		font-size: 0.75rem;
		opacity: 0.8;
	}

	.canvas-container {
		flex: 1;
		min-height: 300px;
		border-radius: 12px;
		overflow: hidden;
		background: rgba(0,0,0,0.3);
		border: 1px solid rgba(255,255,255,0.1);
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
	}

	.info-panel {
		position: absolute;
		bottom: 80px;
		right: 16px;
		background: rgba(0,0,0,0.7);
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255,255,255,0.15);
		border-radius: 12px;
		padding: 0.75rem 1rem;
		min-width: 160px;
	}

	.info-title {
		font-weight: 700;
		font-size: 1rem;
		margin-bottom: 0.5rem;
		color: #f1c40f;
	}

	.info-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
		margin-bottom: 0.25rem;
	}

	.info-label {
		opacity: 0.7;
	}

	.info-value {
		font-weight: 600;
	}

	.axle-info .info-value {
		color: #f39c12;
	}

	.instructions {
		text-align: center;
		font-size: 0.8rem;
		opacity: 0.5;
		margin-top: 0.5rem;
		flex-shrink: 0;
	}

	.back-link {
		margin-top: 0.75rem;
		text-align: center;
		flex-shrink: 0;
	}

	.back-link a {
		color: rgba(255,255,255,0.6);
		text-decoration: none;
		font-size: 0.9rem;
	}

	.back-link a:hover {
		color: #fff;
		text-decoration: underline;
	}

	.page-container.light {
		background: #ffffff;
		color: #222;
	}

	.light h1 {
		background: linear-gradient(90deg, #e67e22, #e74c3c);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}

	.light .ctrl-btn {
		background: rgba(0,0,0,0.06);
		border-color: rgba(0,0,0,0.15);
		color: #222;
	}

	.light .ctrl-btn:hover:not(:disabled) {
		background: rgba(0,0,0,0.1);
	}

	.light .level-active {
		background: rgba(243, 156, 18, 0.2);
		border-color: #e67e22;
		color: #e67e22;
	}

	.light .palette-item {
		background: rgba(0,0,0,0.04);
		border-color: rgba(0,0,0,0.12);
		color: #222;
	}

	.light .palette-item:hover {
		border-color: rgba(0,0,0,0.3);
		background: rgba(0,0,0,0.08);
	}

	.light .canvas-container {
		background: rgba(0,0,0,0.03);
		border-color: rgba(0,0,0,0.1);
	}

	.light .info-panel {
		background: rgba(255,255,255,0.9);
		border-color: rgba(0,0,0,0.12);
		color: #222;
	}

	.light .info-title {
		color: #e67e22;
	}

	.light .info-label {
		opacity: 0.6;
	}

	.light .instructions {
		color: #666;
	}

	.light .back-link a {
		color: rgba(0,0,0,0.5);
	}

	.light .back-link a:hover {
		color: #222;
	}

	@media (min-width: 700px) {
		.page-container {
			padding: 1rem 2rem;
		}

		h1 {
			font-size: 1.8rem;
		}

		.palette-item {
			padding: 0.6rem 1rem;
			min-width: 70px;
		}

		.palette-label {
			font-size: 0.85rem;
		}
	}
</style>
