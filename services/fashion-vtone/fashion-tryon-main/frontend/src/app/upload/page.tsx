"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import ImageUpload from "@/components/ImageUpload";
import { Category } from "@/types";
import { tryOnGarment } from "@/lib/api";
import { Loader2, Sparkles } from "lucide-react";

export default function UploadPage() {
  const router = useRouter();
  const [personImage, setPersonImage] = useState<File | null>(null);
  const [garmentImage, setGarmentImage] = useState<File | null>(null);
  const [category, setCategory] = useState<Category>("tops");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!personImage || !garmentImage) {
      setError("Please upload both person and garment images");
      return;
    }

    setIsLoading(true);

    try {
      const resultBlob = await tryOnGarment({
        personImage,
        garmentImage,
        category,
      });

      // Convert blob to data URL
      const reader = new FileReader();
      reader.onloadend = () => {
        const resultUrl = reader.result as string;
        
        // Create URLs for all images
        const personUrl = URL.createObjectURL(personImage);
        const garmentUrl = URL.createObjectURL(garmentImage);

        // Store in sessionStorage
        sessionStorage.setItem(
          "tryOnResult",
          JSON.stringify({
            resultImageUrl: resultUrl,
            personImageUrl: personUrl,
            garmentImageUrl: garmentUrl,
            category,
          })
        );

        // Navigate to result page
        router.push("/result");
      };
      reader.readAsDataURL(resultBlob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process try-on");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 text-sm font-medium mb-4">
            <Sparkles className="w-4 h-4" />
            Virtual Try-On
          </div>
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
            Upload Your Images
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            Upload a photo of yourself and the garment you want to try on. 
            Our AI will create a realistic virtual fitting.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="max-w-5xl mx-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-8">
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <ImageUpload
                label="Your Photo"
                onImageSelect={setPersonImage}
              />
              <ImageUpload
                label="Garment Image"
                onImageSelect={setGarmentImage}
              />
            </div>

            {/* Category Selection */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                Garment Category
              </label>
              <div className="grid grid-cols-3 gap-4">
                {(["tops", "bottoms", "one-pieces"] as Category[]).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`py-4 px-6 rounded-lg font-medium transition-all ${
                      category === cat
                        ? "bg-purple-600 text-white shadow-lg shadow-purple-500/50"
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg">
                <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !personImage || !garmentImage}
              className="w-full py-4 px-6 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-lg transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Try-On
                </>
              )}
            </button>

            {isLoading && (
              <div className="mt-4 text-center">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  This may take 10-30 seconds depending on image size...
                </p>
              </div>
            )}
          </div>

          {/* Tips Section */}
          <div className="mt-8 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
              Tips for Best Results
            </h3>
            <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
              <li>• Use clear, well-lit photos with good resolution</li>
              <li>• Ensure the person is facing forward in the photo</li>
              <li>• Use garment images with clear views (no models wearing them)</li>
              <li>• Select the correct category for accurate results</li>
            </ul>
          </div>
        </form>
      </main>
    </div>
  );
}
