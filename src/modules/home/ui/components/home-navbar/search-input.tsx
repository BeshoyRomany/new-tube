'use client';
import { Button } from '@/components/ui/button';
import { APP_URL } from '@/constants';
import { SearchIcon, XIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export const SearchInput = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get('query') || '';
  const categoryId = searchParams.get('categoryId') || '';

  //Keep the (query) in the next rerender when im searching to not lose it
  const [value, setValue] = useState<string>(query);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!value.trim()) return;

    const url = new URL('/search', APP_URL);
    url.searchParams.set('query', value.trim());

    //Keep the (category Id) in the next rerender when im searching to not lose it
    if (categoryId) {
      url.searchParams.set('categoryId', categoryId);
    }
    router.push(url.toString());
  };

  return (
    <form onSubmit={handleSearch} className="flex w-full max-w-[600px]">
      <div className="relative w-full">
        <input
          value={value}
          className="w-full pl-4 py-2 pr-12 rounded-l-full border focus:outline-none focus:border-blue-500"
          type="text"
          placeholder="search"
          onChange={(e) => setValue(e.target.value)}
        />
        {value && (
          <Button
            disabled={!value.trim()}
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setValue('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
          >
            <XIcon className="text-gray-500" />
          </Button>
        )}
      </div>
      <button className="px-5 py-2.5 bg-gray-100 border border-l-0 rounded-r-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed">
        <SearchIcon className="size-5" />
      </button>
    </form>
  );
};
