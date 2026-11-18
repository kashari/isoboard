import { Plus, ArrowRight, Copy, Trash2, Pencil, X, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDiagram } from "@/store/diagram";
import { NodeSolid } from "@/nodes/NodeSolid";
import { project } from "@/lib/isometric";
import { Logo } from "./Topbar";
export function Projects({ onClose }: { onClose: () => void }) {
  const { projects, open, newProject, deleteProject, duplicateProject, renameProject } =
    useDiagram();
  return (
    <div className="projects-overlay">
      <div className="projects-top">
        <Logo />
        <Button variant="outline" onClick={onClose}>
          Back to canvas
          <ArrowRight />
        </Button>
      </div>
      <div className="projects-body">
        <div className="eyebrow">A HOME FOR YOUR IDEAS</div>
        <div className="projects-title">
          <h1>
            My sketchbook<span>.</span>
          </h1>
          <Button
            onClick={() => {
              newProject();
              onClose();
            }}
          >
            <Plus />
            New diagram
          </Button>
        </div>
        <div className="project-grid">
          {projects.map((d) => (
            <article className="project-card panel" key={d.id}>
              <Button
                variant="ghost"
                className="project-cover"
                onClick={() => {
                  open(d);
                  onClose();
                }}
                aria-label={`Open ${d.name}`}
              >
                <svg viewBox="-360 -110 820 290">
                  {d.nodes
                    .filter((n) => n.type !== "zone")
                    .map((n) => {
                      const p = project(n.gx, n.gy, n.gz);
                      return (
                        <g key={n.id} transform={`translate(${p.x} ${p.y})`}>
                          <NodeSolid node={n} preview />
                        </g>
                      );
                    })}
                  {!d.nodes.length && <FolderOpen x="-25" y="-25" size={50} />}
                </svg>
              </Button>
              <div className="project-card-info">
                <h3>{d.name}</h3>
                <span>
                  {d.nodes.length} nodes · {d.edges.length} connections
                </span>
                <div>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Rename project"
                    aria-label={`Rename ${d.name}`}
                    onClick={() => {
                      const name = prompt("Project name", d.name);
                      if (name?.trim()) renameProject(d.id, name.trim());
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Duplicate project"
                    aria-label={`Duplicate ${d.name}`}
                    onClick={() => {
                      duplicateProject(d.id);
                      onClose();
                    }}
                  >
                    <Copy />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Delete project"
                    aria-label={`Delete ${d.name}`}
                    onClick={() => {
                      if (confirm(`Delete “${d.name}”?`)) deleteProject(d.id);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </article>
          ))}
          <Button
            variant="outline"
            className="new-project-card"
            onClick={() => {
              newProject();
              onClose();
            }}
          >
            <Plus size={28} />A fresh perspective<span>New diagram</span>
          </Button>
        </div>
      </div>
      <Button
        className="projects-close"
        size="icon"
        variant="ghost"
        aria-label="Close projects"
        onClick={onClose}
      >
        <X />
      </Button>
    </div>
  );
}
