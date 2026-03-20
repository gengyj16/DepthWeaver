
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { DepthWeaverScene, type DepthWeaverSceneHandle } from '@/components/depth-weaver-scene';
import { FileUploader } from '@/components/file-uploader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings, Download, Loader2, Video } from 'lucide-react';
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
  const [blurIntensity, setBlurIntensity] = useState(5);
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
  const [isRecording, setIsRecording] = useState(false);
  const [isFillWarningOpen, setIsFillWarningOpen] = useState(false);
  const [scrollAreaKey, setScrollAreaKey] = useState(Date.now());
  const sceneRef = useRef<DepthWeaverSceneHandle>(null);
  
  // PBR 材质参数
  const [metalness, setMetalness] = useState(0.0);
  const [roughness, setRoughness] = useState(0.8);
  const [normalStrength, setNormalStrength] = useState(1.0);
  const [emissiveIntensity, setEmissiveIntensity] = useState(0.0);
  const [emissiveColor, setEmissiveColor] = useState('#ffffff');
  const [opacity, setOpacity] = useState(1.0);

  // 后期处理参数
  const [bloomEnabled, setBloomEnabled] = useState(false);
  const [bloomIntensity, setBloomIntensity] = useState(1.5);
  const [bloomThreshold, setBloomThreshold] = useState(0.85);
  const [bloomRadius, setBloomRadius] = useState(0.4);
  const [dofEnabled, setDofEnabled] = useState(false);
  const [dofFocus, setDofFocus] = useState(0.5);
  const [dofAperture, setDofAperture] = useState(0.001);
  const [dofMaxBlur, setDofMaxBlur] = useState(0.01);
  const [toneMapping, setToneMapping] = useState('None');
  const [toneMappingExposure, setToneMappingExposure] = useState(1.0);
  const [saturation, setSaturation] = useState(1.0);
  const [contrast, setContrast] = useState(1.0);
  const [brightness, setBrightness] = useState(0.0);
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
  
  const handleRecord = async () => {
    if (!sceneRef.current || isRecording) return;
    setIsRecording(true);
    toast({ title: "录制中", description: "正在自动运镜，请稍候..." });
    try {
      await sceneRef.current.startRecording(3000);
      toast({ title: "录制成功", description: "视频已开始下载。" });
    } catch (error) {
       console.error("Recording failed", error);
       toast({
        variant: "destructive",
        title: "录制失败",
        description: error instanceof Error ? error.message : "发生未知错误",
      });
    } finally {
       setIsRecording(false);
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

  const handleBackgroundModeChange = (value: string) => {
    const newMode = value as 'blur' | 'solid';
    if (scrollAreaRef.current) {
        scrollPositionRef.current = scrollAreaRef.current.scrollTop;
    }
    setBackgroundMode(newMode);
    setScrollAreaKey(Date.now());
  };

  const handleMeshDetailChange = (value: string) => {
    const newDetail = Number(value);
    if (scrollAreaRef.current) {
      scrollPositionRef.current = scrollAreaRef.current.scrollTop;
    }
    setMeshDetail(newDetail);
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
                    <Button variant="outline" onClick={() => setIsExportDialogOpen(true)} disabled={isRecording} className="bg-background/20 hover:bg-muted/30 backdrop-blur-sm border-white/10">
                        <Download className="mr-2 h-4 w-4" />
                        导出
                    </Button>
                    <Button variant="outline" onClick={handleRecord} disabled={isRecording} className="bg-background/20 hover:bg-muted/30 backdrop-blur-sm border-white/10">
                        {isRecording ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
                        {isRecording ? '录制中...' : '录制'}
                    </Button>
                </div>
                <Button variant="outline" onClick={handleReset} disabled={isRecording} className="bg-background/20 hover:bg-muted/30 backdrop-blur-sm border-white/10">
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
              metalness={metalness}
              roughness={roughness}
              normalStrength={normalStrength}
              emissiveIntensity={emissiveIntensity}
              emissiveColor={emissiveColor}
              opacity={opacity}
              bloomEnabled={bloomEnabled}
              bloomIntensity={bloomIntensity}
              bloomThreshold={bloomThreshold}
              bloomRadius={bloomRadius}
              dofEnabled={dofEnabled}
              dofFocus={dofFocus}
              dofAperture={dofAperture}
              dofMaxBlur={dofMaxBlur}
              toneMapping={toneMapping}
              toneMappingExposure={toneMappingExposure}
              saturation={saturation}
              contrast={contrast}
              brightness={brightness}
              onDistanceChange={setCameraDistance}
              onZoomChange={setOrthographicZoom}
            />

            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>导出3D模型</DialogTitle>
                  <DialogDescription asChild>
                    <div>
                      GLB格式文件可广泛应用于支持3D模型的办公演示软件、设计工具及三维建模软件，便于直接使用或进一步编辑。
                      你也可以使用{' '}
                      <a
                        href="https://gltf-viewer.donmccurdy.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        gltf-viewer
                      </a>{' '}
                      在网页端查看。
                    </div>
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
                    背景填充功能仍在开发中，暂时只做留空处理。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogAction onClick={() => setIsFillWarningOpen(false)}>知道了</AlertDialogAction>
              </AlertDialogContent>
            </AlertDialog>


            <div className={cn("absolute bottom-6 right-6 z-20 transition-opacity", (isSettingsOpen || isRecording) && "opacity-0 pointer-events-none")}>
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
                          disabled={!sensorSupported || isRecording}
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
                          <div className={cn("space-y-4", { 'hidden': renderMode !== 'blur' })}>
                               <p className="text-xs text-muted-foreground">对于深度变化较大处，为缓解像素拉伸带来的撕裂感，将拉伸的像素进行模糊处理</p>
                               <div className="flex flex-col gap-2">
                                <Label htmlFor="blur-slider" className="text-center">模糊强度: {blurIntensity.toFixed(1)}</Label>
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
                                <Label htmlFor="blur-offset-slider" className="text-center">取样偏移: {blurOffset.toFixed(1)}</Label>
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
                           <div className={cn("space-y-4", { 'hidden': renderMode !== 'fill' })}>
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
                        <div className={cn("flex items-center gap-4 rounded-lg p-3 bg-background/30", { 'hidden': backgroundMode !== 'solid' })}>
                          <Label htmlFor="bg-color-picker" className="font-semibold">背景颜色</Label>
                          <input
                            id="bg-color-picker"
                            type="color"
                            value={backgroundColor}
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            className="w-24 h-8 p-0 bg-transparent border-none cursor-pointer"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label className="text-center">网格细节</Label>
                          <RadioGroup 
                            value={String(meshDetail)} 
                            onValueChange={handleMeshDetailChange} 
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

                      {/* PBR 材质设置 */}
                      <div className="space-y-4 rounded-lg p-3 bg-muted/50">
                        <Label className="font-semibold">PBR 材质设置</Label>
                        
                        <div className="flex flex-col gap-2">
                          <Label htmlFor="metalness-slider" className="text-center">金属度: {metalness.toFixed(2)}</Label>
                          <Slider
                            id="metalness-slider"
                            min={0}
                            max={1}
                            step={0.01}
                            value={[metalness]}
                            onValueChange={(value) => setMetalness(value[0])}
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label htmlFor="roughness-slider" className="text-center">粗糙度: {roughness.toFixed(2)}</Label>
                          <Slider
                            id="roughness-slider"
                            min={0}
                            max={1}
                            step={0.01}
                            value={[roughness]}
                            onValueChange={(value) => setRoughness(value[0])}
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label htmlFor="normal-slider" className="text-center">法线强度: {normalStrength.toFixed(2)}</Label>
                          <Slider
                            id="normal-slider"
                            min={0}
                            max={5}
                            step={0.1}
                            value={[normalStrength]}
                            onValueChange={(value) => setNormalStrength(value[0])}
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label htmlFor="opacity-slider" className="text-center">透明度: {opacity.toFixed(2)}</Label>
                          <Slider
                            id="opacity-slider"
                            min={0}
                            max={1}
                            step={0.01}
                            value={[opacity]}
                            onValueChange={(value) => setOpacity(value[0])}
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label htmlFor="emissive-slider" className="text-center">自发光强度: {emissiveIntensity.toFixed(2)}</Label>
                          <Slider
                            id="emissive-slider"
                            min={0}
                            max={5}
                            step={0.1}
                            value={[emissiveIntensity]}
                            onValueChange={(value) => setEmissiveIntensity(value[0])}
                          />
                        </div>

                        <div className="flex items-center gap-4 rounded-lg p-3 bg-background/30">
                          <Label htmlFor="emissive-color-picker" className="font-semibold">自发光颜色</Label>
                          <input
                            id="emissive-color-picker"
                            type="color"
                            value={emissiveColor}
                            onChange={(e) => setEmissiveColor(e.target.value)}
                            className="w-24 h-8 p-0 bg-transparent border-none cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* 后期处理设置 */}
                      <div className="space-y-4 rounded-lg p-3 bg-muted/50">
                        <Label className="font-semibold">后期处理</Label>

                        {/* Bloom 辉光效果 */}
                        <div className="space-y-3 rounded-lg p-3 bg-background/30">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="bloom-switch" className="font-semibold">Bloom 辉光</Label>
                            <Switch
                              id="bloom-switch"
                              checked={bloomEnabled}
                              onCheckedChange={setBloomEnabled}
                            />
                          </div>
                          
                          {bloomEnabled && (
                            <div className="space-y-3">
                              <div className="flex flex-col gap-2">
                                <Label htmlFor="bloom-intensity-slider" className="text-center">强度: {bloomIntensity.toFixed(2)}</Label>
                                <Slider
                                  id="bloom-intensity-slider"
                                  min={0}
                                  max={5}
                                  step={0.1}
                                  value={[bloomIntensity]}
                                  onValueChange={(value) => setBloomIntensity(value[0])}
                                />
                              </div>
                              <div className="flex flex-col gap-2">
                                <Label htmlFor="bloom-threshold-slider" className="text-center">阈值: {bloomThreshold.toFixed(2)}</Label>
                                <Slider
                                  id="bloom-threshold-slider"
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  value={[bloomThreshold]}
                                  onValueChange={(value) => setBloomThreshold(value[0])}
                                />
                              </div>
                              <div className="flex flex-col gap-2">
                                <Label htmlFor="bloom-radius-slider" className="text-center">半径: {bloomRadius.toFixed(2)}</Label>
                                <Slider
                                  id="bloom-radius-slider"
                                  min={0}
                                  max={2}
                                  step={0.01}
                                  value={[bloomRadius]}
                                  onValueChange={(value) => setBloomRadius(value[0])}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 景深效果 */}
                        <div className="space-y-3 rounded-lg p-3 bg-background/30">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="dof-switch" className="font-semibold">景深效果</Label>
                            <Switch
                              id="dof-switch"
                              checked={dofEnabled}
                              onCheckedChange={setDofEnabled}
                            />
                          </div>
                          
                          {dofEnabled && (
                            <div className="space-y-3">
                              <div className="flex flex-col gap-2">
                                <Label htmlFor="dof-focus-slider" className="text-center">焦距: {dofFocus.toFixed(2)}</Label>
                                <Slider
                                  id="dof-focus-slider"
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  value={[dofFocus]}
                                  onValueChange={(value) => setDofFocus(value[0])}
                                />
                              </div>
                              <div className="flex flex-col gap-2">
                                <Label htmlFor="dof-aperture-slider" className="text-center">光圈: {dofAperture.toFixed(4)}</Label>
                                <Slider
                                  id="dof-aperture-slider"
                                  min={0.0001}
                                  max={0.01}
                                  step={0.0001}
                                  value={[dofAperture]}
                                  onValueChange={(value) => setDofAperture(value[0])}
                                />
                              </div>
                              <div className="flex flex-col gap-2">
                                <Label htmlFor="dof-maxblur-slider" className="text-center">最大模糊: {dofMaxBlur.toFixed(4)}</Label>
                                <Slider
                                  id="dof-maxblur-slider"
                                  min={0.001}
                                  max={0.05}
                                  step={0.001}
                                  value={[dofMaxBlur]}
                                  onValueChange={(value) => setDofMaxBlur(value[0])}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* 色调映射 */}
                        <div className="space-y-3 rounded-lg p-3 bg-background/30">
                          <Label className="font-semibold">色调映射</Label>
                          <RadioGroup 
                            value={toneMapping} 
                            onValueChange={setToneMapping}
                            className="grid grid-cols-2 gap-2"
                          >
                            {['None', 'ACESFilmic', 'Reinhard', 'Cineon'].map(mode => (
                              <div key={mode}>
                                <RadioGroupItem value={mode} id={`tone-${mode}`} className="peer sr-only" />
                                <Label htmlFor={`tone-${mode}`} className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-2 hover:bg-accent/80 hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent [&:has([data-state=checked])]:border-primary">
                                  {mode}
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="exposure-slider" className="text-center">曝光: {toneMappingExposure.toFixed(2)}</Label>
                            <Slider
                              id="exposure-slider"
                              min={0.1}
                              max={3}
                              step={0.1}
                              value={[toneMappingExposure]}
                              onValueChange={(value) => setToneMappingExposure(value[0])}
                            />
                          </div>
                        </div>

                        {/* 色彩校正 */}
                        <div className="space-y-3 rounded-lg p-3 bg-background/30">
                          <Label className="font-semibold">色彩校正</Label>
                          
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="saturation-slider" className="text-center">饱和度: {saturation.toFixed(2)}</Label>
                            <Slider
                              id="saturation-slider"
                              min={0}
                              max={2}
                              step={0.01}
                              value={[saturation]}
                              onValueChange={(value) => setSaturation(value[0])}
                            />
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="contrast-slider" className="text-center">对比度: {contrast.toFixed(2)}</Label>
                            <Slider
                              id="contrast-slider"
                              min={0}
                              max={2}
                              step={0.01}
                              value={[contrast]}
                              onValueChange={(value) => setContrast(value[0])}
                            />
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="brightness-slider" className="text-center">亮度: {brightness.toFixed(2)}</Label>
                            <Slider
                              id="brightness-slider"
                              min={-1}
                              max={1}
                              step={0.01}
                              value={[brightness]}
                              onValueChange={(value) => setBrightness(value[0])}
                            />
                          </div>
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
