import * as THREE from "three";
import type { Track } from "@/types";
import { CARD_HEIGHT, CARD_WIDTH, paintCard, type CardPaintState } from "./cards";
import { fileNumber, type UltraColumn } from "./columns";

export interface SceneSelection {
  col: number;
  row: number;
}

export interface SceneCallbacks {
  onHover: (track: Track | null, screenX: number, screenY: number) => void;
  onSelect: (selection: SceneSelection) => void;
  onOpen: (selection: SceneSelection) => void;
}

interface Slot {
  col: number;
  row: number;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  track: Track | null;
  trackId: string;
  paintKey: string;
  coverPath: string | null;
  accent: string;
  index: string;
  selected: boolean;
  playing: boolean;
  favorite: boolean;
}

export const ARCHIVE_ROWS = 5;
const COLUMNS = 12;
const ROWS = ARCHIVE_ROWS;
const CARD_W = 1.85;
const CARD_H = 2.3;
const GAP_X = 2.22;
const GAP_Y = 2.54;
const ROW_TOP = ((ROWS - 1) * GAP_Y) / 2;

export class ArchiveScene {
  private host: HTMLElement;
  private callbacks: SceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private deck = new THREE.Group();
  private camera: THREE.PerspectiveCamera;
  private geometry = new THREE.PlaneGeometry(CARD_W, CARD_H);
  private slots: Slot[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(-10, -10);
  private hover: { col: number; row: number } | null = null;
  private selected: SceneSelection = { col: 0, row: 0 };
  private cameraTargetX = 0;
  private frame = 0;
  private running = true;
  private resizeObserver: ResizeObserver;
  private events = new AbortController();
  private covers = new Map<string, HTMLImageElement | null>();
  private coverRequests = new Set<string>();
  private loadCover: (path: string) => Promise<HTMLImageElement | null>;
  private last = performance.now();
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(
    host: HTMLElement,
    callbacks: SceneCallbacks,
    loadCover: (path: string) => Promise<HTMLImageElement | null>,
  ) {
    this.host = host;
    this.callbacks = callbacks;
    this.loadCover = loadCover;

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    host.appendChild(this.renderer.domElement);

    this.deck.rotation.y = -0.1;
    this.scene.add(this.deck);

    this.camera = new THREE.PerspectiveCamera(33, 1, 0.1, 120);
    this.camera.position.set(0, 3.2, 21.5);
    this.camera.lookAt(0, -0.35, 0);

    for (let col = 0; col < COLUMNS; col += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        const canvas = document.createElement("canvas");
        canvas.width = CARD_WIDTH;
        canvas.height = CARD_HEIGHT;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.02,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(this.geometry, material);
        mesh.position.set((col - (COLUMNS - 1) / 2) * GAP_X, ROW_TOP - row * GAP_Y, -row * 0.5);
        mesh.visible = false;
        mesh.userData.col = col;
        mesh.userData.row = row;
        this.deck.add(mesh);
        this.slots.push({
          col,
          row,
          mesh,
          canvas,
          texture,
          track: null,
          trackId: "",
          paintKey: "",
          coverPath: null,
          accent: "#9a8f84",
          index: "000",
          selected: false,
          playing: false,
          favorite: false,
        });
      }
    }

    const grid = new THREE.GridHelper(48, 24, 0xc8bcae, 0xdad1c6);
    grid.position.set(0, ROW_TOP - (ROWS - 1) * GAP_Y - CARD_H, -1);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.22;
    this.deck.add(grid);

    const signal = this.events.signal;
    this.renderer.domElement.addEventListener("pointermove", this.onPointerMove, { signal });
    this.renderer.domElement.addEventListener("pointerleave", this.onPointerLeave, { signal });
    this.renderer.domElement.addEventListener("click", this.onClick, { signal });
    this.renderer.domElement.addEventListener("dblclick", this.onDoubleClick, { signal });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  update(
    columns: UltraColumn[],
    starts: number[],
    selected: SceneSelection,
    playingId: string | null,
    favorites: Set<string>,
  ) {
    this.selected = selected;
    const columnCount = columns.length;

    for (const slot of this.slots) {
      const column = columns[slot.col];
      const trackIndex = (starts[slot.col] ?? 0) + slot.row;
      const track = column?.tracks[trackIndex] ?? null;
      if (!track) {
        slot.mesh.visible = false;
        slot.track = null;
        slot.trackId = "";
        continue;
      }

      const columnAccent = column.color || "#9a8f84";
      const index = fileNumber(trackIndex);
      const isSelected = selected.col === slot.col && selected.row === slot.row;
      const isPlaying = Boolean(playingId && track.id === playingId);
      const favorite = favorites.has(track.id);
      const paintKey = `${isSelected}|${isPlaying}|${favorite}|${columnAccent}|${index}`;

      slot.mesh.visible = true;
      slot.mesh.position.x = (slot.col - (columnCount - 1) / 2) * GAP_X;
      slot.track = track;
      slot.accent = columnAccent;
      slot.index = index;
      slot.selected = isSelected;
      slot.playing = isPlaying;
      slot.favorite = favorite;

      if (slot.trackId !== track.id) {
        slot.trackId = track.id;
        slot.coverPath = track.coverPath;
        slot.paintKey = "";
        if (track.coverPath && !this.covers.has(track.coverPath)) void this.requestCover(track.coverPath);
      }
      if (slot.paintKey !== paintKey) {
        slot.paintKey = paintKey;
        this.paint(slot);
      }

      slot.mesh.material.color.setScalar(selected.col === slot.col ? 1 : 0.72);
    }

    // Center-follow: only enough pan to keep the focused column comfortable.
    const colX = (selected.col - (columnCount - 1) / 2) * GAP_X;
    this.cameraTargetX = colX * 0.62;
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.events.abort();
    this.resizeObserver.disconnect();
    for (const slot of this.slots) {
      slot.texture.dispose();
      slot.mesh.material.dispose();
    }
    this.geometry.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private slotFor(selection: SceneSelection): Slot | undefined {
    return this.slots.find((slot) => slot.col === selection.col && slot.row === selection.row);
  }

  private paint(slot: Slot) {
    if (!slot.track) return;
    const image = slot.coverPath ? this.covers.get(slot.coverPath) ?? null : null;
    const state: CardPaintState = {
      selected: slot.selected,
      playing: slot.playing,
      favorite: slot.favorite,
      accent: slot.accent,
      index: slot.index,
    };
    paintCard(slot.canvas, slot.track, state, image);
    slot.texture.needsUpdate = true;
  }

  private async requestCover(path: string) {
    if (this.coverRequests.has(path)) return;
    this.coverRequests.add(path);
    const image = await this.loadCover(path);
    this.covers.set(path, image);
    this.coverRequests.delete(path);
    for (const slot of this.slots) {
      if (slot.coverPath === path && slot.track) {
        slot.paintKey = "";
        this.paint(slot);
      }
    }
  }

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const hit = this.intersect();
    if (!hit) {
      if (this.hover) {
        this.hover = null;
        this.callbacks.onHover(null, event.clientX, event.clientY);
      }
      this.renderer.domElement.style.cursor = "default";
      return;
    }
    this.hover = { col: hit.col, row: hit.row };
    this.callbacks.onHover(hit.slot.track, event.clientX, event.clientY);
    this.renderer.domElement.style.cursor = "pointer";
  };

  private onPointerLeave = () => {
    this.hover = null;
    this.pointer.set(-10, -10);
    this.callbacks.onHover(null, 0, 0);
  };

  private onClick = () => {
    const hit = this.intersect();
    if (!hit) return;
    this.callbacks.onSelect({ col: hit.col, row: hit.row });
  };

  private onDoubleClick = () => {
    const hit = this.intersect();
    if (!hit) return;
    this.callbacks.onOpen({ col: hit.col, row: hit.row });
  };

  private intersect(): { col: number; row: number; slot: Slot } | null {
    if (this.pointer.x < -1) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.slots.filter((slot) => slot.mesh.visible).map((slot) => slot.mesh),
      false,
    );
    for (const hit of hits) {
      const col = hit.object.userData.col as number;
      const row = hit.object.userData.row as number;
      const slot = this.slotFor({ col, row });
      if (slot?.track) return { col, row, slot };
    }
    return null;
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.tick);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden) return;

    const k = 1 - Math.exp(-(this.reducedMotion ? 40 : 9) * dt);
    this.camera.position.x += (this.cameraTargetX - this.camera.position.x) * k;
    this.camera.lookAt(this.camera.position.x, -0.35, 0);

    const time = now / 1000;
    const hover = this.hover;
    for (const slot of this.slots) {
      if (!slot.mesh.visible) continue;
      const isSelected = this.selected.col === slot.col && this.selected.row === slot.row;
      const isHovered = hover?.col === slot.col && hover.row === slot.row;
      const targetZ = isSelected ? 0.92 : isHovered ? 0.34 : 0;
      const targetScale = isSelected ? 1.035 : isHovered ? 1.014 : 1;
      slot.mesh.position.z += (targetZ - slot.mesh.position.z) * k;
      const pulse = slot.playing ? 1 + Math.sin(time * 1.8) * 0.006 : 1;
      const scale = slot.mesh.scale.x + (targetScale - slot.mesh.scale.x) * k;
      slot.mesh.scale.setScalar(scale * pulse);
    }

    this.renderer.render(this.scene, this.camera);
  };
}
