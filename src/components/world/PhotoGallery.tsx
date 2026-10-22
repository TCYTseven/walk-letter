"use client";

import { photos } from "@/lib/photos";
import { photoPlacements } from "@/lib/path";
import HoloPhoto from "../HoloPhoto";

/** All holographic photo stickers along the memory path. */
export default function PhotoGallery() {
  if (photos.length === 0) return null;
  return (
    <group name="photo-gallery">
      {photoPlacements.map((placement, i) => {
        const photo = photos[i];
        if (!photo) return null;
        return <HoloPhoto key={photo.filename} photo={photo} placement={placement} />;
      })}
    </group>
  );
}
