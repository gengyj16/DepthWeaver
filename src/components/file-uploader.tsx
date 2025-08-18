
"use client";

import { useState, ChangeEvent, DragEvent, ReactNode, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { UploadCloud, FileImage, Loader2, Sparkles, Download, HelpCircle, Info } from 'lucide-react';
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import type { Pipeline } from '@huggingface/transformers';

interface FileUploaderProps {
    onFilesSelected: (image: File, depthMap: File) => void;
}

interface FileInputBoxProps {
    id: string;
    onFileSelect: (file: File) => void;
    acceptedFile: File | null;
    label: string;
    description: string;
    icon: ReactNode;
    showGenerateButton?: boolean;
    onGenerateClick?: () => void;
    isGenerating?: boolean;
    isLocalGenerating?: boolean;
    showHelpButton?: boolean;
    helpDialogContent?: ReactNode;
}

const FileInputBox = ({ 
    id, 
    onFileSelect, 
    acceptedFile, 
    label, 
    description, 
    icon, 
    showGenerateButton, 
    onGenerateClick, 
    isGenerating, 
    isLocalGenerating,
    showHelpButton,
    helpDialogContent
}: FileInputBoxProps) => {
    const [isDragging, setIsDragging] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (acceptedFile) {
            const url = URL.createObjectURL(acceptedFile);
            setPreviewUrl(url);

            return () => {
                URL.revokeObjectURL(url);
                setPreviewUrl(null);
            };
        } else {
            setPreviewUrl(null);
        }
    }, [acceptedFile]);

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            onFileSelect(e.target.files[0]);
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
            onFileSelect(e.dataTransfer.files[0]);
        }
    };

    return (
        <div className="space-y-2">
            <div className='flex items-center justify-between h-9'>
                <div className="flex items-center gap-2">
                    <label htmlFor={id} className="block text-sm font-medium text-foreground">{label}</label>
                </div>
                <div className="flex items-center gap-2">
                    {description && !showGenerateButton && (
                         <p className="text-xs text-muted-foreground">{description}</p>
                    )}
                    {showGenerateButton && onGenerateClick && (
                         <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={onGenerateClick} 
                            disabled={!acceptedFile || isGenerating || isLocalGenerating}
                            className="text-xs"
                        >
                            {isGenerating || isLocalGenerating ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Sparkles className="mr-2 h-4 w-4" />
                            )}
                            生成深度图
                        </Button>
                    )}
                    {showHelpButton && helpDialogContent && (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <HelpCircle className="h-4 w-4" />
                                </Button>
                            </DialogTrigger>
                            {helpDialogContent}
                        </Dialog>
                    )}
                </div>
            </div>
            <label
                htmlFor={id}
                className={cn(
                    "relative group flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-muted/50 border-border transition-colors overflow-hidden",
                    isDragging && "border-primary bg-primary/10"
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragEnter}
                onDrop={handleDrop}
            >
                 {acceptedFile && previewUrl ? (
                    <>
                        <img src={previewUrl} alt="Preview" className="h-full w-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-sm text-white font-semibold max-w-full truncate px-2">{acceptedFile.name}</p>
                            <p className="text-xs text-gray-300">点击或拖动来更换</p>
                        </div>
                        <a
                            href={previewUrl}
                            download={acceptedFile.name}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/80 transition-colors"
                        >
                            <Download className="w-4 h-4" />
                        </a>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                        {icon}
                        <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold text-primary">点击上传</span> 或拖放文件</p>
                        <p className="text-xs text-muted-foreground">支持 PNG, JPG, 或 WEBP</p>
                    </div>
                )}
                <input id={id} type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
            </label>
        </div>
    );
};

export function FileUploader({ onFilesSelected }: FileUploaderProps) {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [depthMapFile, setDepthMapFile] = useState<File | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const { toast } = useToast();
    const defaultApiUrl = 'https://depth-anything-depth-anything-v2.hf.space';
    const [apiUrl, setApiUrl] = useState(defaultApiUrl);
    
    // Local generation state
    const [useLocalGenerator, setUseLocalGenerator] = useState(false);
    const [isLocalGenerating, setIsLocalGenerating] = useState(false);
    const [localModelStatus, setLocalModelStatus] = useState('未下载');
    const [hfEndpoint, setHfEndpoint] = useState('https://hf-mirror.com');
    const pipelineRef = useRef<Pipeline | null>(null);

    useEffect(() => {
        try {
            const savedApiUrl = localStorage.getItem('depthApiUrl');
            if (savedApiUrl) setApiUrl(savedApiUrl);
            
            const savedHfEndpoint = localStorage.getItem('hfEndpoint');
            if (savedHfEndpoint) setHfEndpoint(savedHfEndpoint);
            else localStorage.setItem('hfEndpoint', hfEndpoint);

            const savedUseLocal = localStorage.getItem('useLocalGenerator');
            if(savedUseLocal) setUseLocalGenerator(JSON.parse(savedUseLocal));
            
        } catch (error) {
            console.error("Failed to read from localStorage", error);
        }
    }, []);

    const initializeLocalGenerator = useCallback(async () => {
        if (pipelineRef.current) return;

        setLocalModelStatus('正在准备环境...');
        try {
            const { pipeline, env } = await import('@huggingface/transformers');
            
            if (hfEndpoint) {
                env.remoteHost = hfEndpoint;
            }

            pipelineRef.current = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
                progress_callback: (progress: any) => {
                     if (progress.status === 'progress') {
                        const percentage = (progress.progress).toFixed(2);
                        setLocalModelStatus(`下载中... ${percentage}% (${(progress.loaded / 1024 / 1024).toFixed(2)}MB / ${(progress.total / 1024 / 1024).toFixed(2)}MB)`);
                    } else if (progress.status === 'ready') {
                        setLocalModelStatus('模型准备就绪');
                    }
                     else {
                        setLocalModelStatus(progress.status);
                    }
                }
            });
            setLocalModelStatus('就绪');
        } catch (error) {
            console.error("Local pipeline initialization failed:", error);
            setLocalModelStatus(`失败: ${error instanceof Error ? error.message : String(error)}`);
            pipelineRef.current = null;
        }
    }, [hfEndpoint]);

    useEffect(() => {
        if (useLocalGenerator && !pipelineRef.current) {
            initializeLocalGenerator();
        }
    }, [useLocalGenerator, initializeLocalGenerator]);


    const handleHfEndpointChange = (value: string) => {
        setHfEndpoint(value);
        try {
            localStorage.setItem('hfEndpoint', value);
        } catch (error) {
            console.error("Failed to write to localStorage", error);
        }
    }
    
    const handleUseLocalChange = (checked: boolean) => {
        setUseLocalGenerator(checked);
        try {
            localStorage.setItem('useLocalGenerator', JSON.stringify(checked));
        } catch (error) {
            console.error("Failed to write to localStorage", error);
        }
    }

    const handleSubmit = async () => {
        if (imageFile && depthMapFile) {
            onFilesSelected(imageFile, depthMapFile);
        }
    };
    
    const handleGenerateClick = () => {
        if (useLocalGenerator) {
            handleLocalGenerateDepthMap();
        } else {
            handleRemoteGenerateDepthMap(apiUrl || defaultApiUrl);
        }
    };

    const handleLocalGenerateDepthMap = useCallback(async () => {
        if (!imageFile) return;
        if (!pipelineRef.current) {
            toast({ variant: "destructive", title: "本地模型未就绪", description: "请等待模型下载完成或检查设置。" });
            initializeLocalGenerator();
            return;
        }

        setIsLocalGenerating(true);
        setLocalModelStatus('正在生成深度图...');
        
        try {
            const imageUrl = URL.createObjectURL(imageFile);
            const { depth } = await pipelineRef.current(imageUrl) as any;
            URL.revokeObjectURL(imageUrl);
            
            const canvas = document.createElement('canvas');
            canvas.width = depth.width;
            canvas.height = depth.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not get canvas context');
            
            // The model returns a single-channel (grayscale) depth map.
            // We need to convert it to a 4-channel RGBA image to use with ImageData.
            const rgbaData = new Uint8ClampedArray(depth.width * depth.height * 4);
            for (let i = 0; i < depth.data.length; ++i) {
                const depthValue = depth.data[i];
                rgbaData[i * 4] = depthValue;     // R
                rgbaData[i * 4 + 1] = depthValue; // G
                rgbaData[i * 4 + 2] = depthValue; // B
                rgbaData[i * 4 + 3] = 255;        // A
            }

            const imageData = new ImageData(rgbaData, depth.width, depth.height);
            ctx.putImageData(imageData, 0, 0);

            canvas.toBlob((blob) => {
                if (blob) {
                    const generatedFile = new File([blob], "generated-depth-map.png", { type: "image/png" });
                    setDepthMapFile(generatedFile);
                    toast({ title: "成功", description: "深度图已在本地生成并载入。" });
                } else {
                    throw new Error("Canvas to Blob conversion failed.");
                }
                setIsLocalGenerating(false);
                setLocalModelStatus('就绪');
            }, 'image/png');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Local depth map generation failed:", error);
            toast({ variant: "destructive", title: "本地生成失败", description: errorMessage });
            setIsLocalGenerating(false);
            setLocalModelStatus('就绪');
        }
    }, [imageFile, toast, initializeLocalGenerator]);
    
    const handleRemoteGenerateDepthMap = async (currentApiUrl: string) => {
        if (!imageFile) return;

        setIsGenerating(true);
        const errorHint = "可能的原因：1. 你的网络连接存在问题 2. 达到了API调用频率限制";
        let eventSource: EventSource | null = null;
        
        const effectiveApiUrl = currentApiUrl || defaultApiUrl;

        try {
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

            eventSource = new EventSource(`${effectiveApiUrl}/call/on_submit/${eventId}`);
            
            eventSource.addEventListener('complete', async (event) => {
                if (eventSource) eventSource.close();

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
                            setDepthMapFile(generatedFile);
                            toast({ title: "成功", description: "深度图已生成并载入。" });
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
        }
    };

    const helpDialogContent = (
         <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="sm:max-w-[525px] max-h-[80vh] flex flex-col">
            <DialogHeader>
                <DialogTitle>关于“生成深度图”</DialogTitle>
                <DialogDescription asChild>
                   <div>
                        此功能将照片发送到以下API地址进行处理，这是一个开源模型，你也可以查阅
                        <a 
                            href="https://huggingface.co/spaces/depth-anything/Depth-Anything-V2" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-primary underline hover:text-primary/80"
                        >
                            官方文档
                        </a>
                        本地部署。
                   </div>
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4 overflow-y-auto px-1">
                <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                        <Label htmlFor="api-url" className="font-bold">
                            高级设置:
                        </Label>
                         <Label htmlFor="api-url" className="text-sm">
                            服务器API 地址
                        </Label>
                    </div>
                    <Input
                        id="api-url"
                        value={apiUrl}
                        onChange={(e) => setApiUrl(e.target.value)}
                        placeholder={defaultApiUrl}
                    />
                </div>
                <Separator className="my-4"/>
                <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                        <Switch id="local-generation-switch" checked={useLocalGenerator} onCheckedChange={handleUseLocalChange}/>
                        <Label htmlFor="local-generation-switch" className="font-bold">在浏览器本地生成(beta)</Label>
                    </div>
                     <p className="text-sm text-muted-foreground">
                        启用此选项后，生成深度图功能将完全在浏览器本地进行，生成过程中设备内存占用会短暂升高，根据处理器性能单张处理时长可能在几秒到十几秒不等。首次使用此功能需要连接到服务器下载模型。
                    </p>
                    <div className="text-sm">
                        <span className="font-semibold">离线模型下载状态:</span> <span className="text-muted-foreground">{localModelStatus}</span>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="hf-endpoint" className="text-sm">HF_ENDPOINT (留空则不使用镜像)</Label>
                        <Input
                            id="hf-endpoint"
                            value={hfEndpoint}
                            onChange={(e) => handleHfEndpointChange(e.target.value)}
                            placeholder="https://huggingface.co"
                        />
                    </div>
                </div>
            </div>
        </DialogContent>
    );

    return (
        <Card className="w-full max-w-2xl bg-card/80 backdrop-blur-sm border-border/50 shadow-2xl shadow-black/20">
            <CardHeader className="text-center relative">
                <div className="absolute top-4 right-4 flex items-center gap-2">
                    <Link href="/about" passHref>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Info className="h-5 w-5" />
                        </Button>
                    </Link>
                </div>
                <CardTitle className="text-3xl font-bold">空间照片构建器</CardTitle>
                <CardDescription className="pt-2">
                    上传照片和深度图（Depth Map），为你创建身临其境的空间照片效果。
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FileInputBox 
                        id="image-upload" 
                        onFileSelect={setImageFile} 
                        acceptedFile={imageFile} 
                        label="照片" 
                        description=""
                        icon={<FileImage className="w-10 h-10 mb-3 text-muted-foreground" />}
                        showGenerateButton={true}
                        onGenerateClick={handleGenerateClick}
                        isGenerating={isGenerating}
                        isLocalGenerating={isLocalGenerating}
                        showHelpButton={true}
                        helpDialogContent={helpDialogContent}
                    />
                    <FileInputBox 
                        id="depth-map-upload" 
                        onFileSelect={setDepthMapFile} 
                        acceptedFile={depthMapFile} 
                        label="深度图 (灰度)" 
                        description="颜色从深到浅表示距离由远及近"
                        icon={<UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />}
                    />
                </div>
                <Button onClick={handleSubmit} disabled={!imageFile || !depthMapFile} size="lg" className="w-full text-lg py-6">
                    构建3D场景
                </Button>
            </CardContent>
        </Card>
    );
}

    