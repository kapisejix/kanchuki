-- F-033 Ken Burns auto-video: distinguish a retailer-uploaded clip from a
-- server-generated ffmpeg pan/zoom slideshow, same table/pipeline either way.

CREATE TYPE "ProductVideoSource" AS ENUM ('UPLOAD', 'KEN_BURNS');

ALTER TABLE "product_videos" ADD COLUMN "source" "ProductVideoSource" NOT NULL DEFAULT 'UPLOAD';
