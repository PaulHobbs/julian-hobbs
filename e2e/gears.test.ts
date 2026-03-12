import { expect, test } from '@playwright/test';

test.describe('Gear Train Simulator', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/gears');
	});

	test('page loads with game elements', async ({ page }) => {
		await expect(page.locator('h1')).toHaveText('Gear Train Simulator');
		await expect(page.locator('canvas')).toBeVisible();
		await expect(page.locator('.palette-item').first()).toBeVisible();
	});

	test('canvas has touch-action none for touchscreen support', async ({ page }) => {
		const canvas = page.locator('canvas');
		await expect(canvas).toHaveCSS('touch-action', 'none');
	});

	test('dragging a palette item onto the canvas places a gear', async ({ page }) => {
		const palette = page.locator('.palette-item').first();
		const canvas = page.locator('canvas');

		const paletteBox = await palette.boundingBox();
		const canvasBox = await canvas.boundingBox();
		expect(paletteBox).toBeTruthy();
		expect(canvasBox).toBeTruthy();

		// Drag from palette center to canvas center
		const startX = paletteBox!.x + paletteBox!.width / 2;
		const startY = paletteBox!.y + paletteBox!.height / 2;
		const endX = canvasBox!.x + canvasBox!.width / 2;
		const endY = canvasBox!.y + canvasBox!.height / 2;

		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(endX, endY, { steps: 10 });
		await page.mouse.up();

		// After placing a gear, the info panel should appear (gear is selected)
		await expect(page.locator('.info-panel')).toBeVisible();
	});

	test('touch: dragging a palette item onto the canvas places a gear', async ({ page }) => {
		const palette = page.locator('.palette-item').first();
		const canvas = page.locator('canvas');

		const paletteBox = await palette.boundingBox();
		const canvasBox = await canvas.boundingBox();
		expect(paletteBox).toBeTruthy();
		expect(canvasBox).toBeTruthy();

		const startX = paletteBox!.x + paletteBox!.width / 2;
		const startY = paletteBox!.y + paletteBox!.height / 2;
		const endX = canvasBox!.x + canvasBox!.width / 2;
		const endY = canvasBox!.y + canvasBox!.height / 2;

		// Simulate touch drag using pointer events (touch type)
		await page.locator('.palette-item').first().dispatchEvent('pointerdown', {
			pointerId: 1,
			pointerType: 'touch',
			clientX: startX,
			clientY: startY,
		});

		// Move across intermediate points toward the canvas
		const steps = 10;
		for (let i = 1; i <= steps; i++) {
			const x = startX + ((endX - startX) * i) / steps;
			const y = startY + ((endY - startY) * i) / steps;
			await page.locator('.page-container').dispatchEvent('pointermove', {
				pointerId: 1,
				pointerType: 'touch',
				clientX: x,
				clientY: y,
			});
		}

		await page.locator('.page-container').dispatchEvent('pointerup', {
			pointerId: 1,
			pointerType: 'touch',
			clientX: endX,
			clientY: endY,
		});

		// After placing a gear, the info panel should appear
		await expect(page.locator('.info-panel')).toBeVisible();
	});

	test('touch: dragging an existing gear on the canvas', async ({ page }) => {
		// First place a gear via mouse (known working)
		const palette = page.locator('.palette-item').first();
		const canvas = page.locator('canvas');

		const paletteBox = await palette.boundingBox();
		const canvasBox = await canvas.boundingBox();
		expect(paletteBox).toBeTruthy();
		expect(canvasBox).toBeTruthy();

		const startX = paletteBox!.x + paletteBox!.width / 2;
		const startY = paletteBox!.y + paletteBox!.height / 2;
		const centerX = canvasBox!.x + canvasBox!.width / 2;
		const centerY = canvasBox!.y + canvasBox!.height / 2;

		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(centerX, centerY, { steps: 10 });
		await page.mouse.up();

		// Verify gear was placed
		await expect(page.locator('.info-panel')).toBeVisible();

		// Now simulate a touch drag on the placed gear
		await canvas.dispatchEvent('pointerdown', {
			pointerId: 2,
			pointerType: 'touch',
			clientX: centerX,
			clientY: centerY,
		});

		// Move the gear to the right
		const dragEndX = centerX + 50;
		const dragEndY = centerY;
		const steps = 5;
		for (let i = 1; i <= steps; i++) {
			const x = centerX + ((dragEndX - centerX) * i) / steps;
			await canvas.dispatchEvent('pointermove', {
				pointerId: 2,
				pointerType: 'touch',
				clientX: x,
				clientY: dragEndY,
			});
		}

		await canvas.dispatchEvent('pointerup', {
			pointerId: 2,
			pointerType: 'touch',
			clientX: dragEndX,
			clientY: dragEndY,
		});

		// Gear should still be selected after touch drag
		await expect(page.locator('.info-panel')).toBeVisible();
	});
});
