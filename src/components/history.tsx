
"use client";

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, Image as ImageIcon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { type HistoryDbEntry } from '@/lib/db';


interface HistoryEntryProps {
  entry: HistoryDbEntry;
  onLoad: (entry: HistoryDbEntry) => void;
  onDelete: (id: number) => void;
}

function HistoryEntryCard({ entry, onLoad, onDelete }: HistoryEntryProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (entry.image) {
      const url = URL.createObjectURL(entry.image);
      setImageUrl(url);

      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [entry.image]);
  
  if (!imageUrl) return null;

  return (
    <Card className="group relative overflow-hidden rounded-lg shadow-md transition-all duration-300 hover:shadow-xl">
      <CardContent className="p-0">
        <div
          className="aspect-square w-full relative cursor-pointer"
          onClick={() => onLoad(entry)}
        >
          <Image
            src={imageUrl}
            alt="History thumbnail"
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-lg">
            <ImageIcon className="h-12 w-12 text-white" />
          </div>
        </div>
        <div className="absolute top-2 right-2 z-10">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon" className="h-8 w-8 opacity-80 group-hover:opacity-100 transition-opacity">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确定要删除吗？</AlertDialogTitle>
                <AlertDialogDescription>
                  此操作无法撤销。这将从您的历史记录中永久删除此项目。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(entry.id)}>删除</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white rounded-b-lg">
          <p className="text-xs truncate">
            {new Date(entry.createdAt).toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export interface HistoryListProps {
  history: HistoryDbEntry[];
  onLoad: (entry: HistoryDbEntry) => void;
  onDelete: (id: number) => void;
}

export function HistoryList({ history, onLoad, onDelete }: HistoryListProps) {
  if (history.length === 0) {
    return null;
  }

  return (
     <Card className="w-full max-w-2xl bg-card/80 backdrop-blur-sm border-border/50 shadow-2xl shadow-black/20">
      <CardHeader>
        <CardTitle className="text-center text-2xl font-bold">历史记录</CardTitle>
        <CardDescription className="text-center">点击卡片以载入</CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-80 w-full">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 p-4">
            {history.map((entry) => (
              <HistoryEntryCard 
                key={entry.id} 
                entry={entry} 
                onLoad={onLoad} 
                onDelete={onDelete} 
              />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Re-exporting HistoryDbEntry as HistoryEntry for backward compatibility if needed elsewhere
export type HistoryEntry = HistoryDbEntry;
