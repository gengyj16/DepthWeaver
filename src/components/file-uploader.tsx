"use client";

import { useState, ChangeEvent, DragEvent, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { UploadCloud, FileImage, Loader2, Sparkles, Info } from 'lucide-react';
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

interface FileUploaderProps {
    onFilesSelected: (image: File, depthMap: File) => void;
}

export function FileUploader({ onFilesSelected }: FileUploaderProps) {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationProgress, setGenerationProgress] = useState(0);
    const [generationStatus, setGenerationStatus] = useState('');
    const { toast } = useToast();
    const defaultApiUrl = 'https://depth-anything-depth-anything-v2.hf.space';
    const [apiUrl, setApiUrl] = useState(defaultApiUrl);
    
    const [useLocalGenerator, setUseLocalGenerator] = useState(true);
    const [useMirror, setUseMirror] = useState(false);
    const [localModelStatus, setLocalModelStatus] = useState('未初始化');
    const [localModelName, setLocalModelName] = useState('onnx-community/depth-anything-v2-small');
    const [localGeneratorDevice, setLocalGeneratorDevice] = useState('未知');
    const workerRef = useRef<Worker>();
    const imageFileRef = useRef<File | null>(null);
    const onFilesSelectedRef = useRef(onFilesSelected);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        onFilesSelectedRef.current = onFilesSelected;
    }, [onFilesSelected]);

    useEffect(() => {
        imageFileRef.current = imageFile;
    }, [imageFile]);

    useEffect(() => {
        if (imageFile) {
            const url = URL.createObjectURL(imageFile);
            setPreviewUrl(url);
            return () => {
                URL.revokeObjectURL(url);
                setPreviewUrl(null);
            };
        } else {
            setPreviewUrl(null);
        }
    }, [imageFile]);

    useEffect(() => {
        try {
            const savedApiUrl = localStorage.getItem('depthApiUrl');
            if (savedApiUrl) setApiUrl(savedApiUrl);
            
            const savedUseLocal = localStorage.getItem('useLocalGenerator');
            if(savedUseLocal) setUseLocalGenerator(JSON.parse(savedUseLocal));

            const savedUseMirror = localStorage.getItem('useMirror');
            if(savedUseMirror) setUseMirror(JSON.parse(savedUseMirror));

            const savedModelName = localStorage.getItem('localModelName');
            if (savedModelName) setLocalModelName(savedModelName);
            
        } catch (error) {
            console.error("Failed to read from localStorage", error);
        }

        workerRef.current = new Worker(new URL('../workers/depth-worker.ts', import.meta.url));

        const onMessageReceived = (e: MessageEvent) => {
            const { type, payload } = e.data;
            switch(type) {
                case 'status':
                    setLocalModelStatus(payload);
                    if (payload.includes('下载中')) {
                        const match = payload.match(/(\d+\.\d+)%/);
                        if (match) {
                            setGenerationProgress(parseFloat(match[1]));
                        }
                    } else if (payload === '正在生成深度图...') {
                        setGenerationProgress(90);
                    }
                    break;
                case 'device-info':
                    setLocalGeneratorDevice(payload === 'webgpu' ? 'WebGPU' : 'WASM (CPU)');
                    break;
                case 'result':
                    const { depth } = payload;
                    const canvas = document.createElement('canvas');
                    canvas.width = depth.width;
                    canvas.height = depth.height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('Could not get canvas context');
                    
                    const imageData = new ImageData(new Uint8ClampedArray(depth.data), depth.width, depth.height);
                    ctx.putImageData(imageData, 0, 0);

                    canvas.toBlob((blob) => {
                        const currentImageFile = imageFileRef.current;
                        if (blob && currentImageFile) {
                            const generatedFile = new File([blob], "generated-depth-map.png", { type: "image/png" });
                            setGenerationProgress(100);
                            setGenerationStatus('深度图生成完成');
                            toast({ title: "成功", description: "深度图已生成，正在进入3D场景..." });
                            onFilesSelectedRef.current(currentImageFile, generatedFile);
                        } else {
                            throw new Error("Canvas to Blob conversion failed.");
                        }
                        setIsGenerating(false);
                        setLocalModelStatus('就绪');
                    }, 'image/png');
                    break;
                case 'error':
                    toast({ variant: "destructive", title: "错误", description: payload });
                    setIsGenerating(false);
                    setLocalModelStatus('错误');
                    setGenerationProgress(0);
                    break;
            }
        };

        workerRef.current.addEventListener('message', onMessageReceived);
        workerRef.current.postMessage({ type: 'init', payload: { model: 'pre-check' } });

        return () => {
            workerRef.current?.removeEventListener('message', onMessageReceived);
            workerRef.current?.terminate();
        }
    }, [toast]);

    const initializeLocalGenerator = useCallback(() => {
        if (!workerRef.current) return;
        setLocalModelStatus('正在准备环境...');
        workerRef.current.postMessage({
            type: 'init',
            payload: { model: localModelName, useMirror }
        });
    }, [localModelName, useMirror]);

    useEffect(() => {
        if (useLocalGenerator) {
            initializeLocalGenerator();
        }
    }, [useLocalGenerator, localModelName, useMirror, initializeLocalGenerator]);

    const handleUseLocalChange = (checked: boolean) => {
        setUseLocalGenerator(checked);
        try {
            localStorage.setItem('useLocalGenerator', JSON.stringify(checked));
        } catch (error) {
            console.error("Failed to write to localStorage", error);
        }
    }
    
    const handleUseMirrorChange = (checked: boolean) => {
        setUseMirror(checked);
        try {
            localStorage.setItem('useMirror', JSON.stringify(checked));
        } catch (error) {
            console.error("Failed to write to localStorage", error);
        }
    }

    const handleLocalModelChange = (model: string) => {
        setLocalModelName(model);
        try {
            localStorage.setItem('localModelName', model);
        } catch (error) {
            console.error("Failed to write to localStorage", error);
        }
    }

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            handleImageSelect(e.target.files[0]);
        }
    };

    const handleDragEnter = (e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleImageSelect(e.dataTransfer.files[0]);
        }
    };

    const handleImageSelect = (file: File) => {
        setImageFile(file);
        setGenerationProgress(0);
        setGenerationStatus('准备生成深度图...');
    };

    useEffect(() => {
        if (imageFile && !isGenerating) {
            const timer = setTimeout(() => {
                handleGenerateDepthMap();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [imageFile]);

    const handleGenerateDepthMap = () => {
        if (!imageFile) return;
        
        if (useLocalGenerator) {
            handleLocalGenerateDepthMap();
        } else {
            handleRemoteGenerateDepthMap(apiUrl || defaultApiUrl);
        }
    };

    const handleLocalGenerateDepthMap = useCallback(async () => {
        if (!imageFile || !workerRef.current) return;
        
        if (localModelStatus !== '就绪') {
             toast({ variant: "destructive", title: "本地模型未就绪", description: "请等待模型下载完成或检查设置后重试。" });
             if (localModelStatus === '错误') {
                initializeLocalGenerator();
             }
             return;
        }

        setIsGenerating(true);
        setGenerationStatus('正在生成深度图...');
        setGenerationProgress(10);

        const imageUrl = URL.createObjectURL(imageFile);
        
        setTimeout(() => {
          if(workerRef.current){
             workerRef.current.postMessage({
                type: 'generate',
                payload: { imageUrl }
            });
            setTimeout(() => URL.revokeObjectURL(imageUrl), 1000);
          }
        }, 0);

    }, [imageFile, localModelStatus, initializeLocalGenerator, toast]);
    
    const handleRemoteGenerateDepthMap = async (currentApiUrl: string) => {
        if (!imageFile) return;

        setIsGenerating(true);
        setGenerationStatus('正在连接服务器...');
        setGenerationProgress(10);
        const errorHint = "可能的原因：1. 你的网络连接存在问题 2. 达到了API调用频率限制";
        let eventSource: EventSource | null = null;
        
        const effectiveApiUrl = currentApiUrl || defaultApiUrl;

        try {
            setGenerationStatus('正在上传照片...');
            setGenerationProgress(20);
            
            const formData = new FormData();
            formData.append('files', imageFile);

            const uploadResponse = await fetch(`${effectiveApiUrl}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error(`文件上传失败，状态码: ${uploadResponse.status}`);
            }

            const uploadResult = await uploadResponse.json();
            if (!uploadResult || !Array.isArray(uploadResult) || !uploadResult[0]) {
                throw new Error('文件上传后未收到有效的文件路径。');
            }
            
            setGenerationStatus('正在生成深度图...');
            setGenerationProgress(40);

            const requestData = {
                data: [{ path: uploadResult[0] }]
            };

            const postResponse = await fetch(`${effectiveApiUrl}/call/on_submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            if (!postResponse.ok) {
                throw new Error(`启动任务失败，状态码: ${postResponse.status}`);
            }

            const postResult = await postResponse.json();
            const eventId = postResult.event_id;

            if (!eventId) {
                throw new Error('无法从响应中获取 event_id。');
            }

            setGenerationProgress(60);
            
            eventSource = new EventSource(`${effectiveApiUrl}/call/on_submit/${eventId}`);
            
            eventSource.addEventListener('complete', async (event) => {
                if (eventSource) eventSource.close();
                setGenerationProgress(80);

                const dataStr = (event as MessageEvent).data;
                const outputData = JSON.parse(dataStr);
                
                if (outputData && Array.isArray(outputData) && outputData.length > 1) {
                    const image2 = outputData[1];
                    if(image2 && image2.url){
                        const resultUrl = image2.url.replace('/cal', '');
                        try {
                            const imageResponse = await fetch(resultUrl);
                            if (!imageResponse.ok) {
                                throw new Error(`下载深度图失败，状态码: ${imageResponse.status}`);
                            }
                            const imageBlob = await imageResponse.blob();
                            const generatedFile = new File([imageBlob], "generated-depth-map.png", { type: imageBlob.type });
                            setGenerationProgress(100);
                            setGenerationStatus('深度图生成完成');
                            toast({ title: "成功", description: "深度图已生成，正在进入3D场景..." });
                            onFilesSelected(imageFile, generatedFile);
                        } catch(e) {
                             if (e instanceof Error) {
                                toast({ variant: "destructive", title: "错误", description: `下载生成的深度图时出错: ${e.message}. ${errorHint}` });
                            }
                        }
                    } else {
                         throw new Error('API返回结果格式不正确，缺少URL。');
                    }
                } else {
                    throw new Error('API返回结果格式不正确。');
                }
                setIsGenerating(false);
            });

            eventSource.onerror = (err) => {
                console.error("EventSource failed:", err);
                if (eventSource) eventSource.close();
                toast({ variant: "destructive", title: "错误", description: `获取结果时发生错误。 ${errorHint}` });
                setIsGenerating(false);
                setGenerationProgress(0);
            };

        } catch (error) {
            if (eventSource) eventSource.close();
            console.error("生成深度图时出错:", error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({ 
                variant: "destructive", 
                title: "生成深度图时出错", 
                description: `${errorMessage}. ${errorHint}` 
            });
            setIsGenerating(false);
            setGenerationProgress(0);
        }
    };

    const helpDialogContent = (
         <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="sm:max-w-[525px] max-h-[80vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>深度图生成设置</DialogTitle>
                <DialogDescription>
                    上传照片后将自动生成深度图。你可以选择本地生成或使用远程API。
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 overflow-y-auto px-1">
                <div className="space-y-2">
                    <Label htmlFor="api-url" className="text-sm font-bold">
                        服务器API 地址
                    </Label>
                    <Input
                        id="api-url"
                        value={apiUrl}
                        onChange={(e) => setApiUrl(e.target.value)}
                        placeholder={defaultApiUrl}
                        disabled={useLocalGenerator}
                    />
                </div>
                <Separator className="my-4"/>
                <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                        <Switch id="local-generation-switch" checked={useLocalGenerator} onCheckedChange={handleUseLocalChange}/>
                        <Label htmlFor="local-generation-switch" className="font-bold">在浏览器本地生成</Label>
                    </div>
                     <p className="text-sm text-muted-foreground">
                        启用此选项后，生成深度图功能将完全在浏览器本地进行，生成过程中设备内存占用会短暂升高，根据处理器性能单张处理时长可能在几秒到十几秒不等。首次使用此功能需要连接到国际互联网下载模型。
                    </p>
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
                     <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <Label htmlFor="local-model-select">本地模型选择</Label>
                                <div className="text-sm text-muted-foreground">
                                    运行环境: {localGeneratorDevice}
                                </div>
                            </div>
                             <Select value={localModelName} onValueChange={handleLocalModelChange}>
                                <SelectTrigger id="local-model-select">
                                    <SelectValue placeholder="选择一个模型" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="onnx-community/depth-anything-v2-small">Small (速度最快)</SelectItem>
                                    <SelectItem value="onnx-community/depth-anything-v2-base">Base (中等)</SelectItem>
                                    <SelectItem value="onnx-community/depth-anything-v2-large">Large (效果较好)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {useLocalGenerator && (
                            <div className="text-sm flex justify-between">
                                <div>
                                    <span className="font-semibold">模型状态:</span> <span className="text-muted-foreground">{localModelStatus}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DialogContent>
    );

    return (
        <Card className="w-full max-w-2xl bg-card/80 backdrop-blur-sm border-border/50 shadow-2xl shadow-black/20">
            <CardHeader className="text-center relative">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Info className="h-5 w-5" />
                            </Button>
                        </DialogTrigger>
                        {helpDialogContent}
                    </Dialog>
                    <Link href="/about" passHref>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <FileImage className="h-5 w-5" />
                        </Button>
                    </Link>
                </div>
                <CardTitle className="text-3xl font-bold">空间照片构建器</CardTitle>
                <CardDescription className="pt-2">
                    上传照片，自动生成深度图，为你创建身临其境的空间照片效果。
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <div className='flex items-center justify-between h-9'>
                        <label htmlFor="image-upload" className="block text-sm font-medium text-foreground">上传照片</label>
                        {isGenerating && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {generationStatus}
                            </span>
                        )}
                    </div>
                    <label
                        htmlFor="image-upload"
                        className={cn(
                            "relative group flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-muted/50 border-border transition-colors overflow-hidden",
                            isDragging && "border-primary bg-primary/10"
                        )}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragEnter}
                        onDrop={handleDrop}
                    >
                        {imageFile && previewUrl ? (
                            <>
                                <img src={previewUrl} alt="Preview" className="h-full w-full object-contain" />
                                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-sm text-white font-semibold max-w-full truncate px-2">{imageFile.name}</p>
                                    <p className="text-xs text-gray-300">点击或拖动来更换</p>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                                <UploadCloud className="w-12 h-12 mb-4 text-muted-foreground" />
                                <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold text-primary">点击上传</span> 或拖放文件</p>
                                <p className="text-xs text-muted-foreground">支持 PNG, JPG, 或 WEBP</p>
                            </div>
                        )}
                        <input id="image-upload" type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" disabled={isGenerating} />
                    </label>
                </div>
                
                {isGenerating && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{generationStatus}</span>
                            <span className="font-medium">{Math.round(generationProgress)}%</span>
                        </div>
                        <Progress value={generationProgress} className="h-2" />
                    </div>
                )}
                
                {!isGenerating && imageFile && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <Sparkles className="h-4 w-4" />
                        <span>深度图将自动生成...</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
