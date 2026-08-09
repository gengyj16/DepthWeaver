
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { DepthWeaverScene, type DepthWeaverSceneHandle } from '@/components/depth-weaver-scene';
import {
  SpatialPhotoScene,
  type GeneratedSpatialPhotoAssets,
  type SpatialPhotoAssetUrls,
} from '@/components/spatial-photo-scene';
import { FileUploader } from '@/components/file-uploader';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Settings, Download, Loader2, Video, RefreshCw, Sparkles } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from "@/components/ui/switch"
import { HistoryList } from '@/components/history';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  addHistory,
  deleteHistory,
  deleteSpatialAssets,
  getHistory,
  getSpatialAssets,
  saveSpatialAssets,
  type HistoryDbEntry,
  type SpatialAssetsDbEntry,
} from '@/lib/db';
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
import { SPATIAL_ASSET_VERSION } from '@/lib/spatial-photo';

type RenderMode = 'blur' | 'fill';
type CameraType = 'perspective' | 'orthographic';
type ViewerMode = 'classic' | 'spatial';

function createSpatialAssetUrls(entry: Pick<SpatialAssetsDbEntry, 'background' | 'mask' | 'version' | 'width' | 'height' | 'method' | 'maskedPixelCount'>): SpatialPhotoAssetUrls {
  return {
    backgroundUrl: URL.createObjectURL(entry.background),
    maskUrl: URL.createObjectURL(entry.mask),
    metadata: {
      version: entry.version,
      width: entry.width,
      height: entry.height,
      method: entry.method,
      maskedPixelCount: entry.maskedPixelCount,
    },
  };
}

function revokeSpatialAssetUrls(assets: SpatialPhotoAssetUrls | null) {
  if (!assets) return;
  URL.revokeObjectURL(assets.backgroundUrl);
  URL.revokeObjectURL(assets.maskUrl);
}

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
  const [viewerMode, setViewerMode] = useState<ViewerMode>('classic');
  const [selectionRange, setSelectionRange] = useState(10);
  const [cameraType, setCameraType] = useState<CameraType>('perspective');
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isFillWarningOpen, setIsFillWarningOpen] = useState(false);
  const [scrollAreaKey, setScrollAreaKey] = useState(Date.now());
  const [activeHistoryId, setActiveHistoryId] = useState<number | null>(null);
  const [spatialAssets, setSpatialAssets] = useState<SpatialPhotoAssetUrls | null>(null);
  const [parallaxStrength, setParallaxStrength] = useState(0.035);
  const [spatialFocusDepth, setSpatialFocusDepth] = useState(0.45);
  const [spatialRenderQuality, setSpatialRenderQuality] = useState(24);
  const [aiEnhance, setAiEnhance] = useState(true);
  const [spatialRegenerationToken, setSpatialRegenerationToken] = useState(0);
  const sceneRef = useRef<DepthWeaverSceneHandle>(null);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef(0);
  const historyLoadTokenRef = useRef(0);

  useEffect(() => {
    return () => revokeSpatialAssetUrls(spatialAssets);
  }, [spatialAssets]);

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
    historyLoadTokenRef.current += 1;
    const newEntry: Omit<HistoryDbEntry, 'id'> = {
      image: imageFile,
      depthMap: depthMapFile,
      createdAt: new Date().toISOString(),
    };
    try {
      const id = await addHistory(newEntry);
      setHistory(prev => [{ ...newEntry, id }, ...prev]);
      setActiveHistoryId(id);
      setSpatialAssets(null);
      setImage(URL.createObjectURL(imageFile));
      setDepthMap(URL.createObjectURL(depthMapFile));
      setKey(Date.now());
    } catch (error) {
       console.error("Failed to save history to IndexedDB", error);
    }
  };

  const handleReset = useCallback(() => {
    historyLoadTokenRef.current += 1;
    if (image) URL.revokeObjectURL(image);
    if (depthMap) URL.revokeObjectURL(depthMap);
    setImage(null);
    setDepthMap(null);
    setActiveHistoryId(null);
    setSpatialAssets(null);
  }, [image, depthMap]);
  
  const handleLoadFromHistory = async (entry: HistoryDbEntry) => {
    handleReset();
    const loadToken = historyLoadTokenRef.current;
    let cachedAssetUrls: SpatialPhotoAssetUrls | null = null;
    try {
      const cachedAssets = await getSpatialAssets(entry.id);
      if (loadToken !== historyLoadTokenRef.current) return;
      if (cachedAssets?.version === SPATIAL_ASSET_VERSION) {
        cachedAssetUrls = createSpatialAssetUrls(cachedAssets);
      } else if (cachedAssets) {
        await deleteSpatialAssets(entry.id);
      }
    } catch (error) {
      console.error('Failed to load spatial photo assets from IndexedDB', error);
    }
    if (loadToken !== historyLoadTokenRef.current) {
      revokeSpatialAssetUrls(cachedAssetUrls);
      return;
    }
    setImage(URL.createObjectURL(entry.image));
    setDepthMap(URL.createObjectURL(entry.depthMap));
    setActiveHistoryId(entry.id);
    setSpatialAssets(cachedAssetUrls);
    setKey(Date.now());
  };

  const handleDeleteFromHistory = async (id: number) => {
    try {
      await deleteHistory(id);
      setHistory(prev => prev.filter(entry => entry.id !== id));
      if (activeHistoryId === id) handleReset();
    } catch (error) {
       console.error("Failed to delete history from IndexedDB", error);
    }
  };

  const handleSpatialAssetsGenerated = useCallback(async (generated: GeneratedSpatialPhotoAssets) => {
    setSpatialAssets(createSpatialAssetUrls({
      background: generated.background,
      mask: generated.mask,
      ...generated.metadata,
    }));
    if (activeHistoryId === null) return;
    try {
      await saveSpatialAssets({
        historyId: activeHistoryId,
        background: generated.background,
        mask: generated.mask,
        ...generated.metadata,
      });
    } catch (error) {
      console.error('Failed to cache spatial photo assets', error);
    }
  }, [activeHistoryId]);

  const handleRegenerateSpatialAssets = useCallback(async () => {
    setSpatialAssets(null);
    setSpatialRegenerationToken((token) => token + 1);
    if (activeHistoryId !== null) {
      try {
        await deleteSpatialAssets(activeHistoryId);
      } catch (error) {
        console.error('Failed to delete cached spatial photo assets', error);
      }
    }
  }, [activeHistoryId]);

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

  const handleSensorChange = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      setUseSensor(false);
      return;
    }
    const orientationApi = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (orientationApi?.requestPermission) {
      try {
        const permission = await orientationApi.requestPermission();
        if (permission !== 'granted') {
          toast({
            variant: 'destructive',
            title: '方向传感器未启用',
            description: '请在浏览器设置中允许动作与方向访问。',
          });
          return;
        }
      } catch {
        toast({
          variant: 'destructive',
          title: '无法请求方向传感器权限',
          description: '请确认页面通过 HTTPS 或 localhost 打开。',
        });
        return;
      }
    }
    setUseSensor(true);
  }, [toast]);

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
              backgroundImage: viewerMode === 'classic' && backgroundMode === 'blur' && image ? `url(${image})` : 'none',
              backgroundColor: viewerMode === 'classic' && backgroundMode === 'solid' ? backgroundColor : '#000000',
              filter: viewerMode === 'classic' && backgroundMode === 'blur' ? `blur(36px)` : 'none',
              transform: viewerMode === 'classic' && backgroundMode === 'blur' ? 'scale(1.1)' : 'none',
            }}
          />
          <div className="relative z-10 h-full w-full">
            <header className={cn("absolute top-0 left-0 z-20 p-4 sm:p-6 w-full flex justify-between items-center transition-opacity", isSettingsOpen && "opacity-0 pointer-events-none")}>
                <div className="flex gap-2">
                  {viewerMode === 'classic' && (
                    <Button variant="outline" onClick={() => setIsExportDialogOpen(true)} disabled={isRecording} className="bg-background/20 hover:bg-muted/30 backdrop-blur-sm border-white/10">
                        <Download className="mr-2 h-4 w-4" />
                        导出
                    </Button>
                  )}
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
            
            {viewerMode === 'classic' ? (
              <DepthWeaverScene
                ref={sceneRef}
                key={`classic-${key}`}
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
                onDistanceChange={setCameraDistance}
                onZoomChange={setOrthographicZoom}
              />
            ) : (
              <SpatialPhotoScene
                ref={sceneRef}
                key={`spatial-${key}`}
                image={image}
                depthMap={depthMap}
                assets={spatialAssets}
                parallaxStrength={parallaxStrength}
                focusDepth={spatialFocusDepth}
                renderQuality={spatialRenderQuality}
                useSensor={useSensor}
                aiEnhance={aiEnhance}
                regenerationToken={spatialRegenerationToken}
                onAssetsGenerated={handleSpatialAssetsGenerated}
              />
            )}

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
                      <div className="space-y-3 rounded-lg p-3 bg-muted/50">
                        <Label className="font-semibold">浏览模式</Label>
                        <RadioGroup
                          value={viewerMode}
                          onValueChange={(value) => {
                            setViewerMode(value as ViewerMode);
                            setIsExportDialogOpen(false);
                          }}
                          className="grid grid-cols-2 gap-2"
                        >
                          <div>
                            <RadioGroupItem value="classic" id="viewer-classic" className="peer sr-only" />
                            <Label htmlFor="viewer-classic" className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-3 hover:bg-accent/80 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent">
                              经典高度场
                            </Label>
                          </div>
                          <div>
                            <RadioGroupItem value="spatial" id="viewer-spatial" className="peer sr-only" />
                            <Label htmlFor="viewer-spatial" className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-3 hover:bg-accent/80 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent">
                              空间照片
                            </Label>
                          </div>
                        </RadioGroup>
                        <p className="text-xs text-muted-foreground">两种模式共用当前原图和深度图，切换不会重新生成深度。</p>
                      </div>
                      <div className="flex items-center justify-between rounded-lg p-3 bg-muted/50">
                        <Label htmlFor="sensor-mode" className="font-semibold">
                          跟随传感器方向
                        </Label>
                        <Switch
                          id="sensor-mode"
                          checked={useSensor}
                          onCheckedChange={(enabled) => void handleSensorChange(enabled)}
                          disabled={!sensorSupported || isRecording}
                        />
                      </div>
                      {!sensorSupported && <p className="text-xs text-center text-destructive">您的设备不支持方向传感器。</p>}

                      {viewerMode === 'classic' ? (
                        <>
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
                                <RadioGroupItem value="blur" id="bg-blur" className="peer sr-only" disabled={backgroundMode === 'blur'} />
                                <Label htmlFor="bg-blur" className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-3 hover:bg-accent/80 hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent [&:has([data-state=checked])]:border-primary">
                                  模糊背景
                                </Label>
                              </div>
                              <div>
                                <RadioGroupItem value="solid" id="bg-solid" className="peer sr-only" disabled={backgroundMode === 'solid'} />
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
                                <RadioGroupItem value={String(detail)} id={`mesh-${detail}`} className="peer sr-only" disabled={meshDetail === detail} />
                                <Label htmlFor={`mesh-${detail}`} className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-3 hover:bg-accent/80 hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent [&:has([data-state=checked])]:border-primary">
                                  {detail}
                                </Label>
                              </div>
                            ))}
                          </RadioGroup>
                        </div>
                      </div>
                        </>
                      ) : (
                        <div className="space-y-5 rounded-lg p-3 bg-muted/50">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-4 w-4 text-primary" />
                              <Label className="font-semibold">空间照片设置</Label>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              深度 ray-marching 与局部背景补全会减少边缘拉伸；拖动画面预览视差，双击可复位。
                            </p>
                          </div>

                          <div className="flex flex-col gap-2">
                            <Label htmlFor="spatial-strength" className="text-center">
                              视差强度: {(parallaxStrength * 100).toFixed(1)}%
                            </Label>
                            <Slider
                              id="spatial-strength"
                              min={0.01}
                              max={0.07}
                              step={0.0025}
                              value={[parallaxStrength]}
                              onValueChange={(value) => setParallaxStrength(value[0])}
                            />
                          </div>

                          <div className="flex flex-col gap-2">
                            <Label htmlFor="spatial-focus" className="text-center">
                              稳定焦平面: {spatialFocusDepth.toFixed(2)}
                            </Label>
                            <Slider
                              id="spatial-focus"
                              min={0.1}
                              max={0.9}
                              step={0.01}
                              value={[spatialFocusDepth]}
                              onValueChange={(value) => setSpatialFocusDepth(value[0])}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-center block">光线采样质量</Label>
                            <RadioGroup
                              value={String(spatialRenderQuality)}
                              onValueChange={(value) => setSpatialRenderQuality(Number(value))}
                              className="grid grid-cols-3 gap-2"
                            >
                              {[16, 24, 32].map((quality) => (
                                <div key={quality}>
                                  <RadioGroupItem value={String(quality)} id={`spatial-quality-${quality}`} className="peer sr-only" />
                                  <Label htmlFor={`spatial-quality-${quality}`} className="flex text-sm items-center justify-center rounded-md border-2 border-transparent bg-background/30 p-2 hover:bg-accent/80 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-accent">
                                    {quality === 16 ? '流畅' : quality === 24 ? '均衡' : '精细'}
                                  </Label>
                                </div>
                              ))}
                            </RadioGroup>
                          </div>

                          <div className="flex items-center justify-between rounded-lg p-3 bg-background/30">
                            <div className="space-y-1 pr-3">
                              <Label htmlFor="ai-inpaint" className="font-semibold">设备端 AI 补全</Label>
                              <p className="text-xs text-muted-foreground">首次下载约 28.1 MB，照片不会上传。</p>
                            </div>
                            <Switch id="ai-inpaint" checked={aiEnhance} onCheckedChange={setAiEnhance} />
                          </div>

                          {spatialAssets && (
                            <p className="rounded-md bg-background/30 px-3 py-2 text-xs text-muted-foreground">
                              当前资源：{spatialAssets.metadata.method === 'migan' ? 'MI-GAN AI 补全' : '深度定向快速补全'}
                              {' · '}{spatialAssets.metadata.width}×{spatialAssets.metadata.height}
                              {' · '}补全 {spatialAssets.metadata.maskedPixelCount.toLocaleString()} 像素
                            </p>
                          )}

                          <Button
                            variant="outline"
                            className="w-full bg-background/30"
                            onClick={handleRegenerateSpatialAssets}
                            disabled={isRecording}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            重新分析并补全背景
                          </Button>
                        </div>
                      )}
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
