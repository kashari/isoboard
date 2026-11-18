import { createFileRoute } from "@tanstack/react-router";
import { Editor } from "@/components/isoboard/Editor";

// The home route ships no og:image, so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Isoboard — your isometric sketchbook" },
      {
        name: "description",
        content:
          "Build, connect, and explore isometric system diagrams in a warm technical sketchbook.",
      },
      { property: "og:title", content: "Isoboard — your isometric sketchbook" },
      {
        property: "og:description",
        content:
          "Build, connect, and explore isometric system diagrams in a warm technical sketchbook.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  return <Editor />;
}
