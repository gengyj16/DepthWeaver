"use client";

import { useState, ChangeEvent, DragEvent, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { UploadCloud, FileImage, Loader2, Sparkles, Settings, Info, RefreshCw } from 'lucide-react';
import { useToast } from "@/hooks/use-toast"
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

interface FileUploaderProps {
    onFilesSelected: (image: File, depthMap: File) => void;
}

type GenerationStatus = 'idle' | 'initializing' | 'downloading' | 'ready' | 'generating' | 'complete' | 'error';

export function FileUploader({ onFilesSelected }: FileUploaderProps) {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [depthMapFile, setDepthMapFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const { toast } = useToast();
    
    // Generation state
    const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('idle');
    const [generationProgress, setGenerationProgress] = useState(0);
    const [generationMessage, setGenerationMessage] = useState('');
    const [localGeneratorDevice, setLocalGeneratorDevice] = useState('检测中...');
    const [retryCount, setRetryCount] = useState(0);
    
    // Settings
    const [useMirror, setUseMirror] = useState(false);
    const [localModelName, setLocalModelName] = useState('onnx-community/depth-anything-v2-small');
    
    // Refs
    const workerRef = useRef<Worker | null>(null);
    const pendingImageUrlRef = useRef<string | null>(null);
    const isWorkerReadyRef = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize worker
    useEffect(() => {
        // Load settings from localStorage
        try {
            const savedUseMirror = localStorage.getItem('useMirror');
            if(savedUseMirror) setUseMirror(JSON.parse(savedUseMirror));
            const savedModelName = localStorage.getItem('localModelName');
            if (savedModelName) setLocalModelName(savedModelName);
        } catch (error) {
            console.error("[FileUploader] Failed to read from localStorage", error);
        }

        // Create worker
        console.log('[FileUploader] Creating worker...');
        try {
            workerRef.current = new Worker(
                new URL('../workers/depth-worker.ts', import.meta.url),
                { type: 'module' }
            );
        } catch (error) {
            console.error('[FileUploader] Failed to create worker:', error);
            toast({ 
                variant: "destructive", 
                title: "Worker 错误", 
                description: "无法创建深度图生成 Worker" 
            });
            return;
        }

        const onMessageReceived = (e: MessageEvent) => {
            const { type, payload } = e.data;
            console.log('[FileUploader] Received message:', type, payload);
            
            switch(type) {
                case 'status':
                    setGenerationMessage(payload);
                    if (payload === '就绪' || payload === '模型准备就绪') {
                        setGenerationStatus('ready');
                        setGenerationProgress(100);
                        isWorkerReadyRef.current = true;
                        
                        // If there's a pending image, generate now
                        if (pendingImageUrlRef.current && imageFile) {
                            console.log('[FileUploader] Worker ready, processing pending image');
                            generateDepthMap(pendingImageUrlRef.current);
                            pendingImageUrlRef.current = null;
                        }
                    } else if (payload === '正在生成深度图...') {
                        setGenerationStatus('generating');
                        setGenerationProgress(90);
                    } else if (payload === '正在初始化模型...') {
                        setGenerationStatus('initializing');
                        setGenerationProgress(10);
                    }
                    break;
                    
                case 'progress':
                    setGenerationStatus('downloading');
                    setGenerationProgress(payload.percentage);
                    setGenerationMessage(`下载模型中... ${payload.percentage.toFixed(1)}%`);
                    break;
                    
                case 'device-info':
                    const deviceText = payload === 'webgpu' ? 'WebGPU (GPU加速)' : 'WASM (CPU)';
                    setLocalGeneratorDevice(deviceText);
                    console.log('[FileUploader] Device detected:', payload);
                    break;
                    
                case 'result':
                    handleDepthGenerationResult(payload);
                    break;
                    
                case 'error':
                    console.error('[FileUploader] Worker error:', payload);
                    setGenerationStatus('error');
                    setGenerationMessage('生成失败: ' + payload);
                    toast({ 
                        variant: "destructive", 
                        title: "生成错误", 
                        description: payload 
                    });
                    break;
            }
        };

        workerRef.current.addEventListener('message', onMessageReceived);
        
        // Pre-check environment
        console.log('[FileUploader] Sending pre-check to worker');
        workerRef.current.postMessage({ type: 'init', payload: { model: 'pre-check' } });

        return () => {
            console.log('[FileUploader] Cleaning up worker');
            workerRef.current?.removeEventListener('message', onMessageReceived);
            workerRef.current?.terminate();
            workerRef.current = null;
        }
    }, [toast]);

    // Handle depth generation result
    const handleDepthGenerationResult = useCallback((payload: any) => {
        console.log('[FileUploader] Handling generation result');
        const { depth } = payload;
        
        const canvas = document.createElement('canvas');
        canvas.width = depth.width;
        canvas.height = depth.height;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
            setGenerationStatus('error');
            toast({ variant: "destructive", title: "错误", description: "无法创建画布上下文" });
            return;
        }
        
        const imageData = new ImageData(new Uint8ClampedArray(depth.data), depth.width, depth.height);
        ctx.putImageData(imageData, 0, 0);

        canvas.toBlob((blob) => {
            if (blob) {
                const generatedFile = new File([blob], "generated-depth-map.png", { type: "image/png" });
                setDepthMapFile(generatedFile);
                setGenerationStatus('complete');
                setGenerationProgress(100);
                setGenerationMessage('深度图生成完成！');
                setRetryCount(0);
                console.log('[FileUploader] Depth map generated successfully');
            } else {
                setGenerationStatus('error');
                toast({ variant: "destructive", title: "错误", description: "Canvas to Blob 转换失败" });
            }
        }, 'image/png');
    }, [toast]);

    // Generate depth map
    const generateDepthMap = useCallback((imageUrl: string) => {
        if (!workerRef.current) {
            console.error('[FileUploader] Worker not available');
            return;
        }
        
        console.log('[FileUploader] Sending generate message to worker');
        workerRef.current.postMessage({
            type: 'generate',
            payload: { imageUrl }
        });
    }, []);

    // Initialize model and generate
    const handleGenerateDepthMap = useCallback(async () => {
        if (!imageFile || !workerRef.current) {
            console.error('[FileUploader] Cannot generate: missing image or worker');
            return;
        }
        
        console.log('[FileUploader] Starting depth map generation');
        setGenerationStatus('initializing');
        setGenerationProgress(5);
        setGenerationMessage('正在准备...');

        // Create image URL
        const imageUrl = URL.createObjectURL(imageFile);
        
        // Check if worker is ready
        if (isWorkerReadyRef.current) {
            console.log('[FileUploader] Worker ready, generating immediately');
            generateDepthMap(imageUrl);
        } else {
            console.log('[FileUploader] Worker not ready, initializing first');
            pendingImageUrlRef.current = imageUrl;
            
            // Initialize worker with model
            workerRef.current.postMessage({
                type: 'init',
                payload: { model: localModelName, useMirror }
            });
        }
        
        // Cleanup URL after some time
        setTimeout(() => {
            if (pendingImageUrlRef.current === imageUrl) {
                pendingImageUrlRef.current = null;
            }
            URL.revokeObjectURL(imageUrl);
        }, 60000); // 1 minute timeout
    }, [imageFile, localModelName, useMirror, generateDepthMap]);

    // Retry generation
    const handleRetry = useCallback(() => {
        setRetryCount(prev => prev + 1);
        setGenerationStatus('idle');
        setGenerationProgress(0);
        setGenerationMessage('');
        isWorkerReadyRef.current = false;
        
        // Re-initialize worker
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'init',
                payload: { model: localModelName, useMirror }
            });
        }
        
        // Retry after a short delay
        setTimeout(() => {
            if (imageFile) {
                handleGenerateDepthMap();
            }
        }, 1000);
    }, [imageFile, localModelName, useMirror, handleGenerateDepthMap]);

    // Auto-generate depth map when image is uploaded
    useEffect(() => {
        if (imageFile && !depthMapFile && generationStatus === 'idle') {
            console.log('[FileUploader] Auto-triggering depth map generation');
            handleGenerateDepthMap();
        }
    }, [imageFile, depthMapFile, generationStatus, handleGenerateDepthMap]);

    // Auto-submit when both files are ready
    useEffect(() => {
        if (imageFile && depthMapFile && generationStatus === 'complete') {
            console.log('[FileUploader] Auto-submitting files');
            onFilesSelected(imageFile, depthMapFile);
        }
    }, [imageFile, depthMapFile, generationStatus, onFilesSelected]);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            handleFileSelect(e.target.files[0]);
        }
    };

    const handleFileSelect = (file: File) => {
        console.log('[FileUploader] File selected:', file.name);
        
        // Reset state
        setDepthMapFile(null);
        setGenerationStatus('idle');
        setGenerationProgress(0);
        setGenerationMessage('');
        pendingImageUrlRef.current = null;
        
        setImageFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
    };

    const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleUseMirrorChange = (checked: boolean) => {
        setUseMirror(checked);
        try {
            localStorage.setItem('useMirror', JSON.stringify(checked));
        } catch (error) {
            console.error("[FileUploader] Failed to write to localStorage", error);
        }
    }

    const handleLocalModelChange = (model: string) => {
        setLocalModelName(model);
        try {
            localStorage.setItem('localModelName', model);
        } catch (error) {
            console.error("[FileUploader] Failed to write to localStorage", error);
        }
        
        // Reset worker state when model changes
        isWorkerReadyRef.current = false;
    }

    const getStatusColor = () => {
        switch (generationStatus) {
            case 'error': return 'text-red-500';
            case 'complete': return 'text-green-500';
            case 'generating': return 'text-blue-500';
            case 'ready': return 'text-emerald-500';
            default: return 'text-muted-foreground';
        }
    };

    const isGenerating = generationStatus !== 'idle' && generationStatus !== 'complete' && generationStatus !== 'error';

    return (
        <Card className="w-full max-w-xl bg-card/80 backdrop-blur-sm border-border/50 shadow-2xl shadow-black/20">
            <CardHeader className="text-center relative">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                    <Sheet>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Settings className="h-5 w-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent>
                            <SheetHeader>
                                <SheetTitle>生成设置</SheetTitle>
                            </SheetHeader>
                            <div className="py-6 space-y-6">
                                <div className="space-y-4">
                                    <div className="flex items-center space-x-2">
                                        <Switch id="mirror-switch" checked={useMirror} onCheckedChange={handleUseMirrorChange}/>
                                        <Label htmlFor="mirror-switch">
                                            使用镜像站下载模型 (
                                            <a
                                                href="https://www.modelscope.cn/models"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary underline hover:text-primary/80"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                魔搭社区
                                            </a>
                                            )
                                        </Label>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label htmlFor="local-model-select">AI 模型选择</Label>
                                            <div className="text-xs text-muted-foreground">
                                                运行环境: {localGeneratorDevice}
                                            </div>
                                        </div>
                                        <Select value={localModelName} onValueChange={handleLocalModelChange}>
                                            <SelectTrigger id="local-model-select">
                                                <SelectValue placeholder="选择一个模型" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="onnx-community/depth-anything-v2-small">Small (速度最快)</SelectItem>
                                                <SelectItem value="onnx-community/depth-anything-v2-base">Base (平衡)</SelectItem>
                                                <SelectItem value="onnx-community/depth-anything-v2-large">Large (效果最好)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                    <Link href="/about" passHref>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Info className="h-5 w-5" />
                        </Button>
                    </Link>
                </div>
                <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    上传照片
                </CardTitle>
                <CardDescription>
                    上传一张照片，AI 将自动生成深度图并渲染为 3D 场景
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Upload Area */}
                <div className="space-y-4">
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleFileChange}
                        disabled={isGenerating}
                    />
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        className={cn(
                            "flex flex-col items-center justify-center w-full h-48 rounded-xl cursor-pointer transition-all duration-300 border-2 border-dashed",
                            isDragging
                                ? "border-primary bg-primary/10 scale-[1.02]"
                                : "border-muted-foreground/25 bg-muted/50 hover:bg-muted hover:border-primary/50",
                            isGenerating && "pointer-events-none opacity-50"
                        )}
                    >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none">
                            {isGenerating ? (
                                <Loader2 className="w-10 h-10 mb-3 text-primary animate-spin" />
                            ) : (
                                <UploadCloud className={cn(
                                    "w-10 h-10 mb-3 transition-colors",
                                    isDragging ? "text-primary" : "text-muted-foreground"
                                )} />
                            )}
                            <p className="mb-2 text-sm text-muted-foreground">
                                <span className="font-semibold">点击上传</span> 或拖拽图片到此处
                            </p>
                            <p className="text-xs text-muted-foreground/70">
                                支持 PNG, JPG, WEBP 格式
                            </p>
                        </div>
                    </div>

                    {/* Preview and Status */}
                    {previewUrl && (
                        <div className="space-y-3">
                            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted border">
                                <img 
                                    src={previewUrl} 
                                    alt="Preview" 
                                    className="w-full h-full object-contain"
                                />
                                {isGenerating && (
                                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
                                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                        <div className="text-sm font-medium text-center px-4">
                                            {generationMessage}
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {/* Progress Bar */}
                            {isGenerating && (
                                <div className="space-y-2">
                                    <Progress value={generationProgress} className="h-2" />
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span className={getStatusColor()}>{generationMessage}</span>
                                        <span>{generationProgress.toFixed(0)}%</span>
                                    </div>
                                </div>
                            )}

                            {/* Error State */}
                            {generationStatus === 'error' && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                    <div className="flex-1 text-sm text-red-500">
                                        {generationMessage}
                                    </div>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={handleRetry}
                                        className="gap-1"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                        重试
                                    </Button>
                                </div>
                            )}

                            {/* Success State */}
                            {generationStatus === 'complete' && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                    <Sparkles className="w-4 h-4 text-green-500" />
                                    <span className="text-sm text-green-500">深度图生成完成！正在加载 3D 场景...</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <Separator />

                {/* Info */}
                <div className="text-xs text-muted-foreground space-y-1">
                    <p className="flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        使用 Depth Anything V2 模型在本地生成深度图
                    </p>
                    <p className="flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        支持 WebGPU 加速（如果可用）或 WASM 回退
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}
