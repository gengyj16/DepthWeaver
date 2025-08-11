"use client";

import { useState, useEffect } from 'react';
import { DepthWeaverScene } from '@/components/depth-weaver-scene';
import { FileUploader } from '@/components/file-uploader';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function HomePage() {
  const [image, setImage] = useState<string | null>(null);
  const [depthMap, setDepthMap] = useState<string | null>(null);
  const [key, setKey] = useState(Date.now());

  const handleFilesChange = (imageFile: File, depthMapFile: File) => {
    const imageUrl = URL.createObjectURL(imageFile);
    const depthMapUrl = URL.createObjectURL(depthMapFile);
    setImage(imageUrl);
    setDepthMap(depthMapUrl);
    setKey(Date.now()); // Update key to force re-mount of Scene component
  };

  const handleReset = () => {
    if (image) URL.revokeObjectURL(image);
    if (depthMap) URL.revokeObjectURL(depthMap);
    setImage(null);
    setDepthMap(null);
  };

  useEffect(() => {
    // This effect handles cleanup when the component unmounts.
    return () => {
      if (image) URL.revokeObjectURL(image);
      if (depthMap) URL.revokeObjectURL(depthMap);
    };
  }, [image, depthMap]);

  return (
    <main className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      <header className="absolute top-0 left-0 z-20 p-4 sm:p-6 w-full flex justify-between items-center">
         <h1 className="text-xl sm:text-2xl font-bold font-headline text-primary">Depth Weaver</h1>
         {image && depthMap && (
           <Button variant="outline" onClick={handleReset} className="bg-background/50 hover:bg-muted/80 backdrop-blur-sm">
             <ArrowLeft className="mr-2 h-4 w-4" />
             Upload New
           </Button>
         )}
      </header>
      
      {image && depthMap ? (
        <DepthWeaverScene key={key} image={image} depthMap={depthMap} />
      ) : (
        <div className="flex items-center justify-center h-full w-full px-4">
          <FileUploader onFilesSelected={handleFilesChange} />
        </div>
      )}
    </main>
  );
}
