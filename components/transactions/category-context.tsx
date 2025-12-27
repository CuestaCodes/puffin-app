'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '@/lib/services';
import type { UpperCategory, SubCategoryWithUpper } from '@/types/database';

interface CategoriesData {
  upperCategories: UpperCategory[];
  subCategories: SubCategoryWithUpper[];
}

interface CategoryContextValue {
  categories: CategoriesData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const CategoryContext = createContext<CategoryContextValue | null>(null);

export function CategoryProvider({ children }: { children: ReactNode }) {
  const [categories, setCategories] = useState<CategoriesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.get<CategoriesData>('/api/categories');
      if (result.data) {
        setCategories(result.data);
      } else {
        throw new Error(result.error || 'Failed to fetch categories');
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return (
    <CategoryContext.Provider value={{ categories, isLoading, error, refetch: fetchCategories }}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategories(): CategoryContextValue {
  const context = useContext(CategoryContext);
  if (!context) {
    throw new Error('useCategories must be used within a CategoryProvider');
  }
  return context;
}



