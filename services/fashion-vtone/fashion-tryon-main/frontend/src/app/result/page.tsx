"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Navbar from "@/components/Navbar";
import { Download, ArrowLeft, Sparkles } from "lucide-react";
import { TryOnResult } from "@/types";

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<TryOnResult | null>(null);

  useEffect(() => {
    // Retrieve result from sessionStorage
    const storedResult = sessionStorage.getItem("tryOnResult");
    if (storedResult) {
      setResult(JSON.parse(storedResult));
    } else {
      // No result found, redirect to upload page
      router.push("/upload");
    }
  }, [router]);

  const handleDownload = () => {
    if (!result) return;

    // Create a download link
    const link = document.createElement("a");
    link.href = result.resultImageUrl;
    link.download = `fashion-tryon-result-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTryAnother = () => {
    // Clear the result and go back to upload
    sessionStorage.removeItem("tryOnResult");
    router.push("/upload");
  };

  if (!result) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <div className="animate-spin w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-zinc-600 dark:text-zinc-400">Loading result...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 text-sm font-medium mb-4">
            <Sparkles className="w-4 h-4" />
            Try-On Complete!
          </div>
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
            Your Virtual Try-On Result
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            Compare your original photo with the virtual try-on result
          </p>
        </div>

        {/* Comparison Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Original Person Image */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4 text-center">
              Original Photo
            </h3>
            <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800">
              <Image
                src={result.personImageUrl}
                alt="Original person"
                fill
                className="object-contain"
              />
            </div>
          </div>

          {/* Garment Image */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4 text-center">
              Garment
            </h3>
            <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800">
              <Image
                src={result.garmentImageUrl}
                alt="Garment"
                fill
                className="object-contain"
              />
            </div>
            <div className="mt-4 text-center">
              <span className="inline-block px-3 py-1 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium">
                {result.category}
              </span>
            </div>
          </div>

          {/* Result Image */}
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-2xl shadow-lg border-2 border-purple-200 dark:border-purple-800 p-6">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-4 text-center flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              Try-On Result
            </h3>
            <div className="relative w-full aspect-[3/4] rounded-lg overflow-hidden bg-white dark:bg-zinc-900 shadow-xl">
              <Image
                src={result.resultImageUrl}
                alt="Try-on result"
                fill
                className="object-contain"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={handleTryAnother}
            className="flex items-center gap-2 px-8 py-4 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-zinc-100 rounded-full font-semibold transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Try Another
          </button>

          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-full font-semibold transition-colors shadow-lg shadow-purple-500/50"
          >
            <Download className="w-5 h-5" />
            Download Result
          </button>
        </div>

        {/* Info Section */}
        <div className="mt-12 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 p-8">
          <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4 text-center">
            What&apos;s Next?
          </h3>
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-3xl mb-2">👔</div>
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                Try More Outfits
              </h4>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Experiment with different garments and styles
              </p>
            </div>
            <div>
              <div className="text-3xl mb-2">💾</div>
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                Save Your Favorites
              </h4>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Download and keep the results you love
              </p>
            </div>
            <div>
              <div className="text-3xl mb-2">🛍️</div>
              <h4 className="font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
                Shop with Confidence
              </h4>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Make informed decisions before purchasing
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
