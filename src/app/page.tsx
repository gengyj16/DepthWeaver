
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { DepthWeaverScene, type DepthWeaverSceneHandle } from '@/components/depth-weaver-scene';
import { FileUploader } from '@/components/file-uploader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings, Download, Loader2 } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from "@/components/ui/switch"
import { HistoryList, type HistoryEntry } from '@/components/history';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { addHistory, getHistory, deleteHistory, type HistoryDbEntry } from '@/lib/db';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useToast } from '@/hooks/use-toast';

type RenderMode = 'blur' | 'fill';
type CameraType = 'perspective' | 'orthographic';

export default function HomePage() {
  const [image, setImage] = useState<string | null>(null);
  const [depthMap, setDepthMap] = useState<string | null>(null);
  const [key, setKey] = useState(Date.now());
  const [depthMultiplier, setDepthMultiplier] = useState(0.7);
  const [cameraDistance, setCameraDistance] = useState(2);
  const [orthographicZoom, setOrthographicZoom] = useState(1);
  const [meshDetail, setMeshDetail] = useState(1024);
  const [blurIntensity, setBlurIntensity] = useState(1.0);
  const [blurOffset, setBlurOffset] = useState(1);
  const [viewAngleLimit, setViewAngleLimit] = useState(10);
  const [useSensor, setUseSensor] = useState(false);
  const [sensorSupported, setSensorSupported] = useState(true);
  const [history, setHistory] = useState<HistoryDbEntry[]>([]);
  const [backgroundMode, setBackgroundMode] = useState<'blur' | 'solid'>('blur');
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [containerHeight, setContainerHeight] = useState<string | number>('100vh');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [renderMode, setRenderMode] = useState<RenderMode>('blur');
  const [selectionRange, setSelectionRange] = useState(10);
  const [cameraType, setCameraType] = useState<CameraType>('perspective');
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isFillWarningOpen, setIsFillWarningOpen] = useState(false);
  const [scrollAreaKey, setScrollAreaKey] = useState(Date.now());
  const sceneRef = useRef<DepthWeaverSceneHandle>(null);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollPositionRef.current;
    }
  }, [scrollAreaKey]);

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

    const handleResize = () => {
      setContainerHeight(window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); 

    return () => {
      window.removeEventListener('resize', handleResize);
    };
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

  const handleExport = async () => {
    if (!sceneRef.current) return;
    setIsExporting(true);
    try {
      await sceneRef.current.handleExport('glb');
    } catch (error) {
      console.error("Export failed", error);
      toast({
        variant: "destructive",
        title: "导出失败",
        description: error instanceof Error ? error.message : "发生未知错误",
      });
    } finally {
      setIsExporting(false);
      setIsExportDialogOpen(false);
    }
  };

  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image);
      if (depthMap) URL.revokeObjectURL(depthMap);
    };
  }, [image, depthMap]);
  
  const handleRenderModeChange = (value: string) => {
    const newMode = value as RenderMode;
    setRenderMode(newMode);
    if (newMode === 'fill') {
      setIsFillWarningOpen(true);
    }
  };

  const handleBackgroundModeChange = (value: 'blur' | 'solid') => {
    if (backgroundMode === value) return;
    if (scrollAreaRef.current) {
        scrollPositionRef.current = scrollAreaRef.current.scrollTop;
    }
    setBackgroundMode(value);
    setScrollAreaKey(Date.now());
  };

  const isSceneVisible = image && depthMap;

  return (
    <main 
      className={cn(
        "relative w-full bg-background text-foreground",
        !isSceneVisible && "min-h-screen"
      )}
      style={{ height: isSceneVisible ? containerHeight : 'auto', overflow: isSceneVisible ? 'hidden' : 'visible' }}
    >
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
            <header className={cn("absolute top-0 left-0 z-20 p-4 sm:p-6 w-full flex justify-between items-center transition-opacity", isSettingsOpen && "opacity-0 pointer-events-none")}>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsExportDialogOpen(true)} className="bg-background/20 hover:bg-muted/30 backdrop-blur-sm border-white/10">
                        <Download className="mr-2 h-4 w-4" />
                        导出
                    </Button>
                </div>
                <Button variant="outline" onClick={handleReset} className="bg-background/20 hover:bg-muted/30 backdrop-blur-sm border-white/10">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  返回
                </Button>
            </header>
            
            <DepthWeaverScene 
              ref={sceneRef}
              key={key} 
              image={image} 
              depthMap={depthMap} 
              depthMultiplier={depthMultiplier} 
              cameraDistance={cameraDistance} 
              orthographicZoom={orthographicZoom}
              meshDetail={meshDetail} 
              blurIntensity={blurIntensity} 
              blurOffset={blurOffset}
              viewAngleLimit={viewAngleLimit}
              useSensor={useSensor}
              backgroundMode={backgroundMode}
              backgroundColor={backgroundMode === 'solid' ? backgroundColor : 'transparent'}
              renderMode={renderMode}
              selectionRange={selectionRange}
              cameraType={cameraType}
            />

            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>导出3D模型</DialogTitle>
                  <DialogDescription>
                    此功能将把当前场景导出为GLB文件。导出的模型将包含经过位移的3D网格以及应用了当前渲染设置（如边界模糊）的纹理。
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button onClick={handleExport} disabled={isExporting} className="w-full">
                    {isExporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isExporting ? '正在导出...' : '导出为GLB'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

             <AlertDialog open={isFillWarningOpen} onOpenChange={setIsFillWarningOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>功能开发中</AlertDialogTitle>
                  <AlertDialogDescription>
                    背景填充功能仍在开发中，暂时作为留空处理。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogAction onClick={() => setIsFillWarningOpen(false)}>知道了</AlertDialogAction>
              </AlertDialogContent>
            </AlertDialog>


            <div className={cn("absolute bottom-6 right-6 z-20 transition-opacity", isSettingsOpen && "opacity-0 pointer-events-none")}>
               <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-full h-12 w-12 bg-background/20 hover:bg-muted/30 backdrop-blur-sm shadow-lg border-white/10">
                    <Settings className="h-6 w-6" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:w-[400px] bg-background/30 border-l-border/50 flex flex-col" overlayClassName="bg-transparent">
                  <SheetHeader>
                    <SheetTitle className="text-xl">控制面板</SheetTitle>
                  </SheetHeader>
                  <ScrollArea key={scrollAreaKey} className="flex-1 pr-6 -mr-6" viewportRef={scrollAreaRef}>
                    <div className="py-6 space-y-6">
                      <div className="flex items-center justify-between rounded-lg p-3 bg-muted/50">
                        <Label htmlFor="sensor-mode" className="font-semibold">
                          跟随传感器方向
                        </Label>
                        <Switch
                          id="sensor-mode"
                          checked={useSensor}
                          onCheckedChange={setUseSensor}
                          disabled={!sensorSupported}
                        />
                      </div>
                      {!sensorSupported && <p className="text-xs text-center text-destructive">您的设备不支持方向传感器。</p>}
                      
                      <div className="space-y-4 rounded-lg p-3 bg-muted/50">
                        <Label className="font-semibold">渲染模式</Label>
                         <RadioGroup value={renderMode} onValueChange={handleRenderModeChange} className="grid grid-cols-2 gap-2">
                            <div>
                              <RadioGroupItem value="blur" id="mode-blur" className="peer sr-only" />
                              <Label htmlFor="mode-blur" className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-3 hover:bg-accent/80 hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent [&:has([data-state=checked])]:border-primary">
                                边界模糊
                              </Label>
                            </div>
                            <div>
                              <RadioGroupItem value="fill" id="mode-fill" className="peer sr-only" />
                              <Label htmlFor="mode-fill" className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-3 hover:bg-accent/80 hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent [&:has([data-state=checked])]:border-primary">
                                背景填充(beta)
                              </Label>
                            </div>
                          </RadioGroup>
                          {renderMode === 'blur' ? (
                            <div className="space-y-4">
                               <p className="text-xs text-muted-foreground">对于深度变化较大处，为缓解像素拉伸带来的撕裂感，将拉伸的像素进行模糊处理</p>
                               <div className="flex flex-col gap-2">
                                <Label htmlFor="blur-slider" className="text-center">模糊强度: {blurIntensity.toFixed(2)}</Label>
                                <Slider
                                  id="blur-slider"
                                  min={0}
                                  max={10}
                                  step={0.1}
                                  value={[blurIntensity]}
                                  onValueChange={(value) => setBlurIntensity(value[0])}
                                />
                              </div>
                              <div className="flex flex-col gap-2">
                                <Label htmlFor="blur-offset-slider" className="text-center">取样偏移: {blurOffset.toFixed(2)}</Label>
                                <Slider
                                  id="blur-offset-slider"
                                  min={-1}
                                  max={1}
                                  step={0.1}
                                  value={[blurOffset]}
                                  onValueChange={(value) => setBlurOffset(value[0])}
                                />
                              </div>
                            </div>
                          ) : (
                             <div className="space-y-4">
                                <p className="text-xs text-muted-foreground">从较远处的像素选取颜色，填充背景中原本被遮住的部分</p>
                                <div className="flex flex-col gap-2">
                                <Label htmlFor="selection-range-slider" className="text-center">选区范围: {selectionRange}</Label>
                                <Slider
                                  id="selection-range-slider"
                                  min={1}
                                  max={20}
                                  step={1}
                                  value={[selectionRange]}
                                  onValueChange={(value) => setSelectionRange(value[0])}
                                />
                              </div>
                            </div>
                          )}
                      </div>
                      
                      <div className="space-y-4 rounded-lg p-3 bg-muted/50">
                        <Label className="font-semibold">相机设置</Label>
                        <div className="flex flex-col gap-2">
                          <RadioGroup value={cameraType} onValueChange={(value) => setCameraType(value as CameraType)} className="grid grid-cols-2 gap-2">
                            <div>
                              <RadioGroupItem value="perspective" id="cam-perspective" className="peer sr-only" />
                              <Label htmlFor="cam-perspective" className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-3 hover:bg-accent/80 hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent [&:has([data-state=checked])]:border-primary">
                                透视相机
                              </Label>
                            </div>
                            <div>
                              <RadioGroupItem value="orthographic" id="cam-orthographic" className="peer sr-only" />
                              <Label htmlFor="cam-orthographic" className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-3 hover:bg-accent/80 hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent [&:has([data-state=checked])]:border-primary">
                                正交相机
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="depth-slider" className="text-center">深度: {depthMultiplier.toFixed(2)}</Label>
                          <Slider 
                            id="depth-slider"
                            min={0}
                            max={5}
                            step={0.01}
                            value={[depthMultiplier]}
                            onValueChange={(value) => setDepthMultiplier(value[0])}
                          />
                        </div>
                        {cameraType === 'perspective' && (
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="zoom-slider" className="text-center">距离: {cameraDistance.toFixed(2)}</Label>
                                <Slider
                                id="zoom-slider"
                                min={0.5}
                                max={5}
                                step={0.01}
                                value={[cameraDistance]}
                                onValueChange={(value) => setCameraDistance(value[0])}
                                />
                            </div>
                        )}
                        {cameraType === 'orthographic' && (
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="ortho-zoom-slider" className="text-center">缩放: {orthographicZoom.toFixed(2)}</Label>
                                <Slider
                                id="ortho-zoom-slider"
                                min={0.1}
                                max={5}
                                step={0.01}
                                value={[orthographicZoom]}
                                onValueChange={(value) => setOrthographicZoom(value[0])}
                                />
                            </div>
                        )}
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="angle-limit-slider" className="text-center">视角限制: {viewAngleLimit}°</Label>
                          <Slider
                            id="angle-limit-slider"
                            min={0}
                            max={90}
                            step={1}
                            value={[viewAngleLimit]}
                            onValueChange={(value) => setViewAngleLimit(value[0])}
                          />
                        </div>
                      </div>

                      <div className="space-y-4 rounded-lg p-3 bg-muted/50">
                        <Label className="font-semibold">高级设置</Label>
                         <div className="flex flex-col gap-2">
                          <Label className="text-center">背景</Label>
                            <RadioGroup value={backgroundMode} onValueChange={(value) => handleBackgroundModeChange(value as 'blur' | 'solid')} className="grid grid-cols-2 gap-2">
                              <div>
                                <RadioGroupItem value="blur" id="bg-blur" className="peer sr-only" />
                                <Label htmlFor="bg-blur" className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-3 hover:bg-accent/80 hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent [&:has([data-state=checked])]:border-primary">
                                  模糊背景
                                </Label>
                              </div>
                              <div>
                                <RadioGroupItem value="solid" id="bg-solid" className="peer sr-only" />
                                <Label htmlFor="bg-solid" className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-3 hover:bg-accent/80 hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent [&:has([data-state=checked])]:border-primary">
                                  纯色
                                </Label>
                              </div>
                            </RadioGroup>
                        </div>
                        {backgroundMode === 'solid' && (
                          <div className="flex items-center gap-4 rounded-lg p-3 bg-background/30">
                            <Label htmlFor="bg-color-picker" className="font-semibold">背景颜色</Label>
                            <input 
                              id="bg-color-picker"
                              type="color" 
                              value={backgroundColor} 
                              onChange={(e) => setBackgroundColor(e.target.value)}
                              className="w-24 h-8 p-0 bg-transparent border-none cursor-pointer"
                            />
                          </div>
                        )}
                        <div className="flex flex-col gap-2">
                          <Label className="text-center">网格细节</Label>
                          <RadioGroup 
                            value={String(meshDetail)} 
                            onValueChange={(value) => setMeshDetail(Number(value))} 
                            className="grid grid-cols-3 gap-2"
                          >
                            {[512, 1024, 2048].map(detail => (
                              <div key={detail}>
                                <RadioGroupItem value={String(detail)} id={`mesh-${detail}`} className="peer sr-only" />
                                <Label htmlFor={`mesh-${detail}`} className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-3 hover:bg-accent/80 hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent [&:has([data-state=checked])]:border-primary">
                                  {detail}
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        </div>
                      </div>

                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
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
