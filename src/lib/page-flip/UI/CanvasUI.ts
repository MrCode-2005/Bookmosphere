// @ts-nocheck
import { UI } from "./UI";
import { PageFlip } from "../PageFlip";
import { FlipSetting } from "../Settings";

/**
 * UI for canvas mode
 */
export class CanvasUI extends UI {
    private readonly canvas: HTMLCanvasElement;

    constructor(inBlock: HTMLElement, app: PageFlip, setting: FlipSetting) {
        super(inBlock, app, setting);

        this.wrapper.innerHTML = '<canvas class="stf__canvas"></canvas>';

        this.canvas = inBlock.querySelectorAll('canvas')[0];

        this.distElement = this.canvas;

        this.resizeCanvas();
        this.setHandlers();
    }

    private resizeCanvas(): void {
        const cs = getComputedStyle(this.canvas);
        const width = parseInt(cs.getPropertyValue('width'), 10);
        const height = parseInt(cs.getPropertyValue('height'), 10);

        // Use devicePixelRatio for crystal-clear Retina rendering
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;

        // Scale context so drawing coordinates stay in CSS pixels
        const ctx = this.canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /**
     * Get canvas element
     */
    public getCanvas(): HTMLCanvasElement {
        return this.canvas;
    }

    public update(): void {
        this.resizeCanvas();
        this.app.getRender().update();
    }
}