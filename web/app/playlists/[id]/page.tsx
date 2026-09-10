"use client";

import { PlaylistCmsEditor } from "@/components/PlaylistCmsEditor";
import { useParams } from "next/navigation";

export default function EditPlaylistPage() {
  const params = useParams();
  const playlistId = Number(params?.id);

  return <PlaylistCmsEditor mode="edit" playlistId={playlistId} />;
}
