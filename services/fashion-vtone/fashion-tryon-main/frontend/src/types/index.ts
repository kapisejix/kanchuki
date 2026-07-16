export type Category = "tops" | "bottoms" | "one-pieces";

export interface TryOnRequest {
  personImage: File;
  garmentImage: File;
  category: Category;
}

export interface TryOnResult {
  resultImageUrl: string;
  personImageUrl: string;
  garmentImageUrl: string;
  category: Category;
}
