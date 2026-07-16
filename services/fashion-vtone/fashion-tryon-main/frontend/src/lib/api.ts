import { TryOnRequest } from "@/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function tryOnGarment(request: TryOnRequest): Promise<Blob> {
  const formData = new FormData();
  formData.append("person_image", request.personImage);
  formData.append("garment_image", request.garmentImage);
  formData.append("category", request.category);

  const response = await fetch(`${API_BASE_URL}/try-on`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Try-on failed: ${errorText}`);
  }

  return await response.blob();
}

export async function checkHealth(): Promise<{ status: string; pipeline_loaded: boolean }> {
  const response = await fetch(`${API_BASE_URL}/health`);
  if (!response.ok) {
    throw new Error("Health check failed");
  }
  return await response.json();
}
