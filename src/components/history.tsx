
"use client";

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
} from "@/components/ui/alert-dialog"


export interface HistoryEntry {
  id: string;
  image: string;
  depthMap: string;
  createdAt: string;
}

interface HistoryListProps {
  history: HistoryEntry[];
  onLoad: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
}

export function HistoryList({ history, onLoad, onDelete }: HistoryListProps) {
  if (history.length === 0) {
    return null;
  }

  return (
    <div className="py-8 px-4 md:px-8">
      <h2 className="text-2xl font-bold text-center mb-6">历史记录</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {history.map((entry) => (
          <Card key={entry.id} className="group relative overflow-hidden">
            <CardContent className="p-0">
              <div
                className="aspect-square w-full relative cursor-pointer"
                onClick={() => onLoad(entry)}
              >
                <Image
                  src={entry.image}
                  alt="History thumbnail"
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <ImageIcon className="h-12 w-12 text-white" />
                </div>
              </div>
              <div className="absolute top-1 right-1">
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
               <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                 <p className="text-xs text-white/90 truncate">
                   {new Date(entry.createdAt).toLocaleString()}
                 </p>
               </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
