
"use client";

import { useState, useEffect, useCallback } from 'react';
import { DepthWeaverScene } from '@/components/depth-weaver-scene';
import { FileUploader } from '@/components/file-uploader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronsUpDown, Settings, X } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from "@/components/ui/switch"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { HistoryList, type HistoryEntry } from '@/components/history';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { addHistory, getHistory, deleteHistory, type HistoryDbEntry } from '@/lib/db';

export default function HomePage() {
  const [image, setImage] = useState<string | null>(null);
  const [depthMap, setDepthMap] = useState<string | null>(null);
  const [key, setKey] = useState(Date.now());
  const [depthMultiplier, setDepthMultiplier] = useState(0.7);
  const [cameraDistance, setCameraDistance] = useState(2);
  const [meshDetail, setMeshDetail] = useState(1024);
  const [blurIntensity, setBlurIntensity] = useState(1.0);
  const [viewAngleLimit, setViewAngleLimit] = useState(10);
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [useSensor, setUseSensor] = useState(false);
  const [sensorSupported, setSensorSupported] = useState(true);
  const [history, setHistory] = useState<HistoryDbEntry[]>([]);
  const [backgroundMode, setBackgroundMode] = useState<'blur' | 'solid'>('blur');
  const [backgroundColor, setBackgroundColor] = useState('#000000');


  useEffect(() => {
    if (typeof window.DeviceOrientationEvent === 'undefined') {
      setSensorSupported(false);
    }
    
    const loadHistory = async () => {
      try {
        const storedHistory = await getHistory();
        setHistory(storedHistory);
      } catch (error) {
        console.error("Failed to load history from IndexedDB", error);
      }
    };
    loadHistory();
  }, []);

  const handleFilesChange = async (imageFile: File, depthMapFile: File) => {
    const newEntry: Omit<HistoryDbEntry, 'id'> = {
      image: imageFile,
      depthMap: depthMapFile,
      createdAt: new Date().toISOString(),
    };
    try {
      const id = await addHistory(newEntry);
      setHistory(prev => [{ ...newEntry, id }, ...prev]);
      setImage(URL.createObjectURL(imageFile));
      setDepthMap(URL.createObjectURL(depthMapFile));
      setKey(Date.now());
    } catch (error) {
       console.error("Failed to save history to IndexedDB", error);
    }
  };

  const handleReset = useCallback(() => {
    if (image) URL.revokeObjectURL(image);
    if (depthMap) URL.revokeObjectURL(depthMap);
    setImage(null);
    setDepthMap(null);
  }, [image, depthMap]);
  
  const handleLoadFromHistory = (entry: HistoryDbEntry) => {
    handleReset();
    setImage(URL.createObjectURL(entry.image));
    setDepthMap(URL.createObjectURL(entry.depthMap));
    setKey(Date.now());
  };

  const handleDeleteFromHistory = async (id: number) => {
    try {
      await deleteHistory(id);
      setHistory(prev => prev.filter(entry => entry.id !== id));
    } catch (error) {
       console.error("Failed to delete history from IndexedDB", error);
    }
  };


  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image);
      if (depthMap) URL.revokeObjectURL(depthMap);
    };
  }, [image, depthMap]);

  const isSceneVisible = image && depthMap;

  return (
    <main className={cn(
      "relative w-full bg-background text-foreground",
      isSceneVisible ? "h-screen overflow-hidden" : "min-h-screen"
    )}>
      {isSceneVisible ? (
        <>
          <div 
            className="absolute inset-0 w-full h-full z-0 bg-cover bg-center"
            style={{ 
              backgroundImage: backgroundMode === 'blur' && image ? `url(${image})` : 'none',
              backgroundColor: backgroundMode === 'solid' ? backgroundColor : 'transparent',
              filter: backgroundMode === 'blur' ? `blur(36px)` : 'none',
              transform: backgroundMode === 'blur' ? 'scale(1.1)' : 'none',
            }}
          />
          <div className="relative z-10 h-full w-full">
            <header className="absolute top-0 left-0 z-20 p-4 sm:p-6 w-full flex justify-end items-center">
                <Button variant="outline" onClick={handleReset} className="bg-background/50 hover:bg-muted/80 backdrop-blur-sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  返回
                </Button>
            </header>
            
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
              backgroundMode={'solid'}
              backgroundColor={'transparent'}
            />

            <div className="absolute bottom-6 right-6 z-20">
               <Collapsible
                open={isControlsOpen}
                onOpenChange={setIsControlsOpen}
                className="w-80"
              >
                 <div className="flex justify-end">
                  {!isControlsOpen && (
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="icon" className="rounded-full h-12 w-12 bg-background/50 hover:bg-muted/80 backdrop-blur-sm shadow-lg">
                        <Settings className="h-6 w-6" />
                      </Button>
                    </CollapsibleTrigger>
                  )}
                </div>
                <CollapsibleContent>
                  <div className="p-6 bg-background/80 backdrop-blur-lg rounded-2xl shadow-lg space-y-4 border border-border/20">
                    <div className="flex items-center justify-between">
                       <h3 className="text-lg font-semibold">控制面板</h3>
                       <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <X className="h-4 w-4" />
                          </Button>
                       </CollapsibleTrigger>
                    </div>

                    <div className="space-y-6">
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
                        <Label className="text-center">背景</Label>
                          <RadioGroup value={backgroundMode} onValueChange={(value: 'blur' | 'solid') => setBackgroundMode(value)} className="grid grid-cols-2 gap-2">
                            <div>
                              <RadioGroupItem value="blur" id="bg-blur" className="peer sr-only" />
                              <Label htmlFor="bg-blur" className="flex text-sm items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                模糊背景
                              </Label>
                            </div>
                            <div>
                              <RadioGroupItem value="solid" id="bg-solid" className="peer sr-only" />
                              <Label htmlFor="bg-solid" className="flex text-sm items-center justify-center rounded-md border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                纯色
                              </Label>
                            </div>
                          </RadioGroup>
                      </div>

                      {backgroundMode === 'solid' && (
                        <div className="flex items-center gap-4 rounded-lg border p-3 shadow-sm bg-background/30">
                          <Label htmlFor="bg-color-picker" className="font-semibold">背景颜色</Label>
                          <Input 
                            id="bg-color-picker"
                            type="color" 
                            value={backgroundColor} 
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            className="w-24 h-8 p-1"
                          />
                        </div>
                      )}

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
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-start w-full min-h-screen px-4 py-8 sm:py-16 gap-8">
            <FileUploader onFilesSelected={handleFilesChange} />
            {history.length > 0 && (
              <HistoryList 
                history={history}
                onLoad={handleLoadFromHistory}
                onDelete={handleDeleteFromHistory}
              />
            )}
        </div>
      )}
    </main>
  );
}
