
"use client";

import { useState, useEffect } from 'react';
import { DepthWeaverScene } from '@/components/depth-weaver-scene';
import { FileUploader } from '@/components/file-uploader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronsUpDown } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from "@/components/ui/switch"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { HistoryList, type HistoryEntry } from '@/components/history';

export default function HomePage() {
  const [image, setImage] = useState<string | null>(null);
  const [depthMap, setDepthMap] = useState<string | null>(null);
  const [key, setKey] = useState(Date.now());
  const [depthMultiplier, setDepthMultiplier] = useState(0.7);
  const [cameraDistance, setCameraDistance] = useState(2);
  const [meshDetail, setMeshDetail] = useState(1024);
  const [blurIntensity, setBlurIntensity] = useState(1.0);
  const [viewAngleLimit, setViewAngleLimit] = useState(10);
  const [isControlsOpen, setIsControlsOpen] = useState(true);
  const [useSensor, setUseSensor] = useState(false);
  const [sensorSupported, setSensorSupported] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    if (typeof window.DeviceOrientationEvent === 'undefined') {
      setSensorSupported(false);
    }
    
    try {
      const storedHistory = localStorage.getItem('depth-weaver-history');
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (error) {
      console.error("Failed to load history from localStorage", error);
    }
  }, []);

  const saveHistory = (newHistory: HistoryEntry[]) => {
    try {
      localStorage.setItem('depth-weaver-history', JSON.stringify(newHistory));
      setHistory(newHistory);
    } catch (error) {
      console.error("Failed to save history to localStorage", error);
    }
  };

  const handleFilesChange = (imageDataUrl: string, depthMapDataUrl: string) => {
    setImage(imageDataUrl);
    setDepthMap(depthMapDataUrl);
    setKey(Date.now());

    const newEntry: HistoryEntry = {
      id: Date.now().toString(),
      image: imageDataUrl,
      depthMap: depthMapDataUrl,
      createdAt: new Date().toISOString(),
    };
    saveHistory([newEntry, ...history]);
  };

  const handleReset = () => {
    // No need to revoke object URLs if we are using data URLs from history
    if (image && image.startsWith('blob:')) URL.revokeObjectURL(image);
    if (depthMap && depthMap.startsWith('blob:')) URL.revokeObjectURL(depthMap);
    setImage(null);
    setDepthMap(null);
  };
  
  const handleLoadFromHistory = (entry: HistoryEntry) => {
    handleReset(); // Clear any existing blob URLs
    setImage(entry.image);
    setDepthMap(entry.depthMap);
    setKey(Date.now());
  };

  const handleDeleteFromHistory = (id: string) => {
    const newHistory = history.filter(entry => entry.id !== id);
    saveHistory(newHistory);
  };


  useEffect(() => {
    // This effect handles cleanup for blob URLs when the component unmounts.
    return () => {
      if (image && image.startsWith('blob:')) URL.revokeObjectURL(image);
      if (depthMap && depthMap.startsWith('blob:')) URL.revokeObjectURL(depthMap);
    };
  }, [image, depthMap]);

  return (
    <main className="relative h-screen w-full overflow-y-auto bg-background text-foreground">
      <div className="h-screen w-full flex-shrink-0">
        <header className="absolute top-0 left-0 z-20 p-4 sm:p-6 w-full flex justify-end items-center">
          {image && depthMap && (
            <Button variant="outline" onClick={handleReset} className="bg-background/50 hover:bg-muted/80 backdrop-blur-sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回
            </Button>
          )}
        </header>
        
        {image && depthMap ? (
          <>
            <DepthWeaverScene 
              key={key} 
              image={image} 
              depthMap={depthMap} 
              depthMultiplier={depthMultiplier} 
              cameraDistance={cameraDistance} 
              meshDetail={meshDetail} 
              blurIntensity={blurIntensity} 
              viewAngleLimit={viewAngleLimit}
              useSensor={useSensor}
            />
            <Collapsible
              open={isControlsOpen}
              onOpenChange={setIsControlsOpen}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-80"
            >
              <div className="flex justify-center">
                  <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full bg-background/50 hover:bg-muted/80 backdrop-blur-sm rounded-t-lg rounded-b-none p-2 h-auto">
                          <span className="text-sm font-medium">控制面板</span>
                          <ChevronsUpDown className="h-4 w-4 ml-2" />
                      </Button>
                  </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="p-4 bg-background/50 backdrop-blur-sm rounded-b-lg shadow-lg">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm bg-background/30">
                      <Label htmlFor="sensor-mode" className="font-semibold">
                        遵循传感器方向
                      </Label>
                      <Switch
                        id="sensor-mode"
                        checked={useSensor}
                        onCheckedChange={setUseSensor}
                        disabled={!sensorSupported}
                      />
                    </div>
                    {!sensorSupported && <p className="text-xs text-center text-destructive">您的设备不支持方向传感器。</p>}

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="depth-slider" className="text-center">深度: {depthMultiplier.toFixed(2)}</Label>
                      <Slider 
                        id="depth-slider"
                        min={0}
                        max={1}
                        step={0.01}
                        value={[depthMultiplier]}
                        onValueChange={(value) => setDepthMultiplier(value[0])}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="zoom-slider" className="text-center">距离: {cameraDistance.toFixed(2)}</Label>
                      <Slider
                        id="zoom-slider"
                        min={0.5}
                        max={2.5}
                        step={0.01}
                        value={[cameraDistance]}
                        onValueChange={(value) => setCameraDistance(value[0])}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="mesh-detail-slider" className="text-center">网格细节: {meshDetail}</Label>
                      <Slider
                        id="mesh-detail-slider"
                        min={256}
                        max={2048}
                        step={256}
        
                        value={[meshDetail]}
                        onValueChange={(value) => setMeshDetail(value[0])}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="blur-slider" className="text-center">模糊强度: {blurIntensity.toFixed(2)}</Label>
                      <Slider
                        id="blur-slider"
                        min={0}
                        max={5}
                        step={0.1}
                        value={[blurIntensity]}
                        onValueChange={(value) => setBlurIntensity(value[0])}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="angle-limit-slider" className="text-center">视角限制: {viewAngleLimit}°</Label>
                      <Slider
                        id="angle-limit-slider"
                        min={0}
                        max={45}
                        step={1}
                        value={[viewAngleLimit]}
                        onValueChange={(value) => setViewAngleLimit(value[0])}
                      />
                    </div>
                  </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        ) : (
          <div className="flex items-center justify-center h-full w-full px-4">
            <FileUploader onFilesSelected={handleFilesChange} />
          </div>
        )}
      </div>
      
      {!image && !depthMap && history.length > 0 && (
         <div className="w-full bg-background border-t">
          <HistoryList 
            history={history}
            onLoad={handleLoadFromHistory}
            onDelete={handleDeleteFromHistory}
          />
        </div>
      )}
    </main>
  );
}
