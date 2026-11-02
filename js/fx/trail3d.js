// Eased pointer plus a short fading trail in clip space (-1..1, y up), fed to the particle shader.
// Slot 0 is the hover head (lit while the pointer moved recently), slots 1.. are the fading motion trail.
// Ported from the GN Mazal pointer trail.
import { Vector3 } from 'three';

export const TRAIL_POINTS = 6;
const TRAIL_LIFETIME_S = 1.1;
const SAMPLE_EVERY_S = 0.05;
const MOUSE_HOVER_POWER = 0.7;
const TOUCH_HOVER_POWER = 0.6;
const TOUCH_RELEASE_S = 0.9;
const HEAD_EASE = 7;
const ACTIVE_MS = 1500;
const BURST_POWER = 1.3;

export class PointerTrail {
  constructor() {
    this.uniform = Array.from({ length: TRAIL_POINTS }, () => new Vector3(0, 0, 0));
    this.targetX = 0;
    this.targetY = 0;
    this.x = 0;
    this.y = 0;
    this.energy = 0;
    this.touchScale = 1;
    this.seen = false;
    this.held = false;
    this.lastMoveAt = -Infinity;
    this.hoverPower = 0;
    this.hoverTarget = 0;
    this.samples = [];
    this.lastSample = 0;
    this.pendingBurst = null;
  }

  move(nx, ny, touch = false) {
    if (!this.seen) {
      this.x = nx;
      this.y = ny;
      this.seen = true;
    }
    this.targetX = nx;
    this.targetY = ny;
    this.touchScale = touch ? 0.7 : 1;
    this.held = true;
    this.lastMoveAt = performance.now();
    this.hoverTarget = touch ? TOUCH_HOVER_POWER : MOUSE_HOVER_POWER;
  }

  /** Pointer left the window or the finger lifted: the head fades out. */
  release() {
    this.held = false;
    this.hoverTarget = 0;
  }

  /** A tap or click: a strong one-off ripple at that point, also on touch where there is no hover. */
  burst(nx, ny, touch = false) {
    this.move(nx, ny, touch);
    this.pendingBurst = { x: nx, y: ny, power: BURST_POWER };
  }

  decayHeld() {
    if (this.held && performance.now() - this.lastMoveAt > ACTIVE_MS) {
      this.held = false;
      this.hoverTarget = 0;
    }
  }

  /** True while the pointer moved recently, so the loop can drop to the idle cap otherwise. */
  get active() {
    this.decayHeld();
    return this.held;
  }

  /** now is in seconds. */
  update(now, dt) {
    this.decayHeld();
    if (this.seen) {
      const ease = 1 - Math.exp(-dt * HEAD_EASE);
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      this.x += dx * ease;
      this.y += dy * ease;
      this.energy = Math.min(1, this.energy + Math.hypot(dx, dy) * 1.6);
      this.energy *= Math.exp(-dt * 1.6);
      const fadeRate = this.held ? 6 : 3 / TOUCH_RELEASE_S;
      this.hoverPower += (this.hoverTarget - this.hoverPower) * (1 - Math.exp(-dt * fadeRate));
      if (this.pendingBurst) {
        this.samples = [{ ...this.pendingBurst, born: now }, ...this.samples].slice(0, TRAIL_POINTS - 1);
        this.pendingBurst = null;
        this.lastSample = now;
      } else if (this.energy > 0.03 && now - this.lastSample > SAMPLE_EVERY_S) {
        this.lastSample = now;
        const sample = { x: this.x, y: this.y, born: now, power: this.energy * this.touchScale };
        this.samples = [sample, ...this.samples].slice(0, TRAIL_POINTS - 1);
      }
    }
    this.write(now);
  }

  write(now) {
    this.uniform[0].set(this.x, this.y, this.seen ? this.hoverPower : 0);
    for (let i = 1; i < TRAIL_POINTS; i += 1) {
      const sample = this.samples[i - 1];
      if (!sample) {
        this.uniform[i].set(0, 0, 0);
        continue;
      }
      const life = Math.max(0, 1 - (now - sample.born) / TRAIL_LIFETIME_S);
      this.uniform[i].set(sample.x, sample.y, sample.power * life * life);
    }
    if (this.samples.length && now - this.samples[this.samples.length - 1].born > TRAIL_LIFETIME_S) {
      this.samples = this.samples.filter((s) => now - s.born <= TRAIL_LIFETIME_S);
    }
  }
}
