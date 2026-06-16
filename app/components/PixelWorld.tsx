"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Agent, Building } from "@/app/lib/types";
import { getStageForRevenue } from "@/app/lib/world/stages";

type Props = {
  agents: Agent[];
  buildings: Building[];
  revenue: number;
  selectedAgentId?: string;
  selectedBuildingId?: string;
  onSelectAgent: (agent: Agent) => void;
  onSelectBuilding: (building: Building) => void;
};

const worldWidth = 1040;
const worldHeight = 560;
const plaza = { x: 500, y: 270 };

function color(hex: string) {
  return Number.parseInt(hex.replace("#", ""), 16);
}

function agentPosition(agent: Agent, index: number, frame: number, buildings: Building[]) {
  const building = buildings.find((item) => item.id === agent.location);
  const destination = building ? { x: building.x + building.width / 2, y: building.y + building.height + 26 } : { x: plaza.x, y: plaza.y };
  const routePhase = ((frame / 150 + index * 0.17) % 1 + 1) % 1;
  const x = plaza.x + (destination.x - plaza.x) * routePhase + Math.sin(frame / 16 + index) * 5;
  const y = plaza.y + (destination.y - plaza.y) * routePhase + Math.cos(frame / 18 + index) * 4;

  return { x, y };
}

export function PixelWorld({
  agents,
  buildings,
  revenue,
  selectedAgentId,
  selectedBuildingId,
  onSelectAgent,
  onSelectBuilding
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const stage = useMemo(() => getStageForRevenue(revenue), [revenue]);

  useEffect(() => {
    let game: { destroy: (removeCanvas: boolean) => void } | null = null;
    let cancelled = false;

    async function bootPhaser() {
      const Phaser = await import("phaser");
      if (cancelled || !mountRef.current) return;

      class AgentWorldScene extends Phaser.Scene {
        private frame = 0;
        private agentBodies: Array<{ agent: Agent; index: number; parts: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Text> }> = [];

        create() {
          this.drawGround();
          this.drawRivers();
          this.drawPaths();
          this.drawDecorations();
          buildings.forEach((building) => this.drawBuilding(building));
          this.drawNpcWorkers();
          agents.forEach((agent, index) => this.drawAgent(agent, index));
          this.drawHud();
        }

        update() {
          this.frame += 1;
          this.agentBodies.forEach(({ agent, index, parts }) => {
            const pos = agentPosition(agent, index, this.frame, buildings);
            const [shadow, body, head, leftLeg, rightLeg, eyeOne, eyeTwo, marker] = parts;
            shadow.setPosition(pos.x, pos.y + 9);
            body.setPosition(pos.x, pos.y);
            head.setPosition(pos.x, pos.y - 11);
            leftLeg.setPosition(pos.x - 4, pos.y + 9 + Math.sin(this.frame / 8 + index) * 2);
            rightLeg.setPosition(pos.x + 4, pos.y + 9 - Math.sin(this.frame / 8 + index) * 2);
            eyeOne.setPosition(pos.x - 2, pos.y - 12);
            eyeTwo.setPosition(pos.x + 3, pos.y - 12);
            if (marker) marker.setPosition(pos.x + 15, pos.y - 22);
          });
        }

        private rect(x: number, y: number, width: number, height: number, fill: number, alpha = 1) {
          return this.add.rectangle(x + width / 2, y + height / 2, width, height, fill, alpha).setOrigin(0.5);
        }

        private label(value: string, x: number, y: number, size = 11, fill = "#241b2f") {
          return this.add.text(x, y, value, {
            fontFamily: "Courier New, monospace",
            fontSize: `${size}px`,
            color: fill
          });
        }

        private drawGround() {
          this.cameras.main.setBackgroundColor("#6faf66");
          for (let y = 0; y < worldHeight; y += 24) {
            for (let x = 0; x < worldWidth; x += 24) {
              this.rect(x, y, 24, 24, (x / 24 + y / 24) % 2 === 0 ? 0x74b76c : 0x6faf66);
              if ((x + y) % 96 === 0) this.rect(x + 8, y + 14, 5, 5, 0x4f944f);
            }
          }
        }

        private drawRivers() {
          const river = this.add.graphics();
          river.fillStyle(0x5da6c8, 1);
          river.fillRect(18, 28, 190, 24);
          river.fillRect(24, 52, 204, 18);
          river.fillRect(824, 466, 188, 28);
          river.fillRect(804, 440, 158, 26);
          river.fillStyle(0x9bd3df, 1);
          river.fillRect(42, 42, 38, 4);
          river.fillRect(858, 476, 44, 4);
        }

        private drawPaths() {
          this.rect(0, 258, worldWidth, 44, 0xd8bd79);
          this.rect(480, 0, 48, worldHeight, 0xd8bd79);
          this.rect(246, 128, 560, 32, 0xd8bd79);
          this.rect(248, 366, 558, 34, 0xd8bd79);
          this.rect(112, 188, 40, 148, 0xd8bd79);
          this.rect(874, 184, 40, 150, 0xd8bd79);

          const plazaShape = this.add.polygon(plaza.x, plaza.y, [0, -48, 72, 0, 0, 48, -72, 0], 0xead08c);
          plazaShape.setStrokeStyle(8, 0xcaa666);

          for (let x = 0; x < worldWidth; x += 28) this.rect(x + 8, 277, 8, 8, 0xb89558);
          for (let y = 0; y < worldHeight; y += 28) this.rect(500, y + 8, 8, 8, 0xb89558);
        }

        private drawDecorations() {
          const treeCount = stage.id === "campsite" ? 8 : stage.id === "cabins" ? 12 : stage.id === "village" ? 18 : 24;
          for (let i = 0; i < treeCount; i += 1) {
            const x = 38 + ((i * 97) % 940);
            const y = 78 + ((i * 71) % 410);
            if (x > 430 && x < 560 && y > 180 && y < 340) continue;
            this.rect(x + 9, y + 18, 10, 18, 0x6b4b35);
            this.rect(x, y, 28, 24, 0x3f8d46);
            this.rect(x + 6, y - 8, 22, 24, 0x57a957);
          }

          if (["village", "town", "city", "metropolis", "empire"].includes(stage.id)) {
            this.rect(448, 212, 104, 72, 0xb77c46);
            this.rect(436, 196, 128, 24, 0x6f4936);
            this.rect(490, 244, 22, 40, 0x2a2234);
          } else {
            this.rect(468, 232, 60, 48, 0x9a6b42);
            this.rect(480, 204, 34, 28, 0xf0d7a0);
            this.rect(532, 254, 28, 22, 0xd66140);
            this.rect(541, 244, 9, 9, 0xffd06e);
          }

          if (["town", "city", "metropolis", "empire"].includes(stage.id)) {
            this.rect(30, 102, 150, 26, 0x7b7f9f);
            this.rect(834, 98, 148, 26, 0x7b7f9f);
          }

          if (["city", "metropolis", "empire"].includes(stage.id)) {
            for (let x = 54; x <= 884; x += 166) {
              this.rect(x, 16, 48, 76, 0x5a697f);
              this.rect(x + 12, 34, 8, 8, 0xffe9a6);
              this.rect(x + 28, 58, 8, 8, 0x9ce7ff);
            }
          }

          if (stage.id === "empire") {
            this.rect(458, 70, 116, 24, 0xf5d978);
            this.rect(474, 94, 84, 120, 0xd3b65f);
          }
        }

        private drawBuilding(building: Building) {
          const selected = selectedBuildingId === building.id;
          const roof = selected ? 0xfff1a8 : 0x382947;
          this.rect(building.x + 8, building.y + building.height - 14, building.width - 16, 18, 0x20181c, 0.35);
          const hit = this.rect(building.x, building.y + 30, building.width, building.height - 30, color(building.color));
          this.rect(building.x + 10, building.y + 42, building.width - 20, building.height - 52, 0x4c3b50);
          this.rect(building.x - 8, building.y + 18, building.width + 16, 22, roof);
          this.rect(building.x + 8, building.y, building.width - 16, 28, roof);
          this.rect(building.x + building.width / 2 - 12, building.y + building.height - 30, 24, 30, 0x231b25);

          for (let i = 0; i < Math.max(2, Math.floor(building.width / 38)); i += 1) this.rect(building.x + 18 + i * 34, building.y + 52, 12, 12, 0x9ce7ff);

          hit.setInteractive({ useHandCursor: true });
          hit.on("pointerover", () => setHoverLabel(building.name));
          hit.on("pointerout", () => setHoverLabel(null));
          hit.on("pointerdown", () => onSelectBuilding(building));
          this.label(building.name, building.x + 4, building.y + building.height + 18);
        }

        private drawNpcWorkers() {
          const workers = [
            { x: 280, y: 274, c: 0x5fc7a3 },
            { x: 720, y: 280, c: 0xd68fe8 },
            { x: 418, y: 338, c: 0xf0c14b }
          ];
          workers.forEach((worker, index) => {
            this.rect(worker.x - 5, worker.y - 4, 10, 12, worker.c);
            this.rect(worker.x - 4, worker.y - 13, 8, 8, 0xf0c08a);
            this.label("NPC", worker.x - 10, worker.y + 12, 8, "#2a2234");
          });
        }

        private drawAgent(agent: Agent, index: number) {
          const pos = agentPosition(agent, index, this.frame, buildings);
          const tunic = agent.approvalRequired ? 0xf0c14b : agent.status === "working" ? 0x5fc7a3 : agent.status === "thinking" ? 0x8fc4ff : 0xd68fe8;
          const shadow = this.add.rectangle(pos.x, pos.y + 9, 20, 8, 0x20181c, 0.3);
          const body = this.add.rectangle(pos.x, pos.y, 14, 12, tunic);
          const head = this.add.rectangle(pos.x, pos.y - 11, 10, 8, 0xf0c08a);
          const leftLeg = this.add.rectangle(pos.x - 4, pos.y + 9, 5, 7, 0x292338);
          const rightLeg = this.add.rectangle(pos.x + 4, pos.y + 9, 5, 7, 0x292338);
          const eyeOne = this.add.rectangle(pos.x - 2, pos.y - 12, 2, 2, 0x231b25);
          const eyeTwo = this.add.rectangle(pos.x + 3, pos.y - 12, 2, 2, 0x231b25);
          const marker = agent.approvalRequired ? this.add.text(pos.x + 12, pos.y - 28, "!", { fontFamily: "Courier New, monospace", fontSize: "14px", color: "#fff1a8", backgroundColor: "#e74b57" }) : this.add.text(-100, -100, "", {});

          body.setInteractive({ useHandCursor: true });
          body.on("pointerover", () => setHoverLabel(agent.name));
          body.on("pointerout", () => setHoverLabel(null));
          body.on("pointerdown", () => onSelectAgent(agent));

          if (selectedAgentId === agent.id) body.setStrokeStyle(2, 0xfff1a8);
          this.agentBodies.push({ agent, index, parts: [shadow, body, head, leftLeg, rightLeg, eyeOne, eyeTwo, marker] });
        }

        private drawHud() {
          this.rect(16, 16, 390, 56, 0xfff4c7, 0.88);
          this.label(`AGENT WORLD: ${stage.label.toUpperCase()}`, 28, 34, 16);
          this.label(stage.description, 28, 56, 10);
        }
      }

      game = new Phaser.Game({
        type: Phaser.AUTO,
        width: worldWidth,
        height: worldHeight,
        parent: mountRef.current,
        backgroundColor: "#6faf66",
        pixelArt: true,
        scene: AgentWorldScene,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH
        }
      });
    }

    bootPhaser();

    return () => {
      cancelled = true;
      if (game) game.destroy(true);
    };
  }, [agents, buildings, onSelectAgent, onSelectBuilding, selectedAgentId, selectedBuildingId, stage]);

  return (
    <div className="relative h-[560px] w-full overflow-hidden rounded border-2 border-[#2a2234] bg-[#6faf66]">
      <div ref={mountRef} className="h-full w-full" />
      {hoverLabel ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded border border-[#fff1a8] bg-[#211b2b] px-2 py-1 font-pixel text-xs text-[#fff1a8]">
          {hoverLabel}
        </div>
      ) : null}
    </div>
  );
}
