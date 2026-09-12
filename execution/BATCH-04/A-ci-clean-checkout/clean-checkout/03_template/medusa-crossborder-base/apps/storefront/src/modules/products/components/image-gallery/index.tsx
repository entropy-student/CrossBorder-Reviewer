"use client"

import { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { useState } from "react"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
}

const ImageGallery = ({ images }: ImageGalleryProps) => {
  const [activeId, setActiveId] = useState(images[0]?.id)
  const activeImage = images.find((image) => image.id === activeId) || images[0]

  return (
    <div className="ph-pdp-gallery">
      <div className="ph-pdp-thumbnails" aria-label="Product gallery">
        {images.length ? images.map((image, index) => (
          <button
            type="button"
            key={image.id}
            className={activeImage?.id === image.id ? "is-active" : ""}
            onClick={() => setActiveId(image.id)}
            aria-label={`View product image ${index + 1}`}
            aria-pressed={activeImage?.id === image.id}
          >
            {image.url ? (
              <Image src={image.url} alt="" fill sizes="92px" />
            ) : (
              <span>Image</span>
            )}
          </button>
        )) : (
          <span className="ph-pdp-thumb-empty">Image</span>
        )}
      </div>
      <div className="ph-pdp-main-image-shell">
        {activeImage?.url ? (
          <Image
            src={activeImage.url}
            priority
            className="ph-pdp-main-image"
            alt="Product"
            fill
            sizes="(max-width: 767px) calc(100vw - 38px), 604px"
          />
        ) : (
          <div className="ph-pdp-image-fallback">
            <span>Product image unavailable</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageGallery
