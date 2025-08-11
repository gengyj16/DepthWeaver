
"use client";

import { useState, ChangeEvent, DragEvent, ReactNode, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { UploadCloud, FileImage, Loader2, Sparkles, Download, HelpCircle } from 'lucide-react';
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

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
    onGenerateClick?: (apiUrl: string) => void;
    isGenerating?: boolean;
    apiUrl: string;
    setApiUrl: (url: string) => void;
    defaultApiUrl: string;
}

const FileInputBox = ({ id, onFileSelect, acceptedFile, label, description, icon, showGenerateButton, onGenerateClick, isGenerating, apiUrl, setApiUrl, defaultApiUrl }: FileInputBoxProps) => {
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
            <div className='flex items-center justify-between min-h-[32px]'>
                <div className="flex items-center gap-2">
                    <label htmlFor={id} className="block text-sm font-medium text-foreground">{label}</label>
                    <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <div className="flex items-center gap-2">
                    {showGenerateButton && (
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => onGenerateClick?.(apiUrl || defaultApiUrl)} 
                            disabled={!acceptedFile || isGenerating}
                            className="text-xs"
                        >
                            {isGenerating ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Sparkles className="mr-2 h-4 w-4" />
                            )}
                            生成深度图
                        </Button>
                    )}
                     {showGenerateButton && (
                         <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <HelpCircle className="h-4 w-4" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
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
                                <div className="grid gap-4 py-4">
                                    <div className="space-y-2">
                                        <div className="flex items-baseline gap-2">
                                            <Label htmlFor="api-url" className="font-bold">
                                                高级设置:
                                            </Label>
                                             <Label htmlFor="api-url" className="text-sm">
                                                API 地址
                                            </Label>
                                        </div>
                                        <Input
                                            id="api-url"
                                            value={apiUrl}
                                            onChange={(e) => setApiUrl(e.target.value)}
                                            placeholder={defaultApiUrl}
                                        />
                                    </div>
                                </div>
                            </DialogContent>
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

    const handleSubmit = () => {
        if (imageFile && depthMapFile) {
            onFilesSelected(imageFile, depthMapFile);
        }
    };

    const readFileAsDataURL = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    };

    const dataURLtoBlob = (dataURL: string): Blob => {
        const parts = dataURL.split(';base64,');
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }
        return new Blob([uInt8Array], { type: contentType });
    };

    const handleGenerateDepthMap = async (currentApiUrl: string) => {
        if (!imageFile) return;

        setIsGenerating(true);
        try {
            // 使用上传的文件处理
            const dataURL = await readFileAsDataURL(imageFile);
            const blob = dataURLtoBlob(dataURL);
            
            // 创建FormData对象
            const formData = new FormData();
            formData.append('files', blob, imageFile.name);
            
            const effectiveApiUrl = currentApiUrl || defaultApiUrl;

            // 首先上传文件
            const uploadResponse = await fetch(`${effectiveApiUrl}/upload`, {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error(`文件上传失败，状态码: ${uploadResponse.status}`);
            }

            const uploadResult = await uploadResponse.json();
            
            // 使用上传后的文件路径
            const requestData = {
                data: [{ path: uploadResult[0] }]
            };

            // Step 1: Initiate the process and get event_id
            const postResponse = await fetch(`${effectiveApiUrl}/call/on_submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            });

            if (!postResponse.ok) {
                throw new Error(`初始请求失败，状态码: ${postResponse.status}`);
            }

            const postResult = await postResponse.json();
            const eventId = postResult.event_id;

            if (!eventId) {
                throw new Error('无法从初始响应中获取event_id。');
            }

            // Step 2: Poll the event stream for the result
            const eventSource = new EventSource(`${effectiveApiUrl}/call/on_submit/${eventId}`);
            
            eventSource.addEventListener('complete', async (event: MessageEvent) => {
                const dataStr = event.data.replace(/^data: /, '');
                const message = JSON.parse(dataStr);
                eventSource.close();
                setIsGenerating(false);
                
                if (message && Array.isArray(message)) {
                    const image2 = message[1];
                    if(image2 && image2.url){
                        const resultUrlPath = image2.url.replace('/cal', '');
                        const fullResultUrl = `${effectiveApiUrl}/file=${resultUrlPath}`;
                        
                        try {
                            const imageResponse = await fetch(fullResultUrl);
                            if (!imageResponse.ok) {
                                throw new Error(`下载深度图失败，状态码: ${imageResponse.status}`);
                            }
                            const imageBlob = await imageResponse.blob();
                            const generatedFile = new File([imageBlob], "generated-depth-map.png", { type: imageBlob.type });
                            setDepthMapFile(generatedFile);
                            toast({ title: "成功", description: "深度图已生成并载入。" });
                        } catch(e) {
                             if (e instanceof Error) {
                                toast({ variant: "destructive", title: "错误", description: `下载生成的深度图时出错: ${e.message}` });
                            }
                        }
                    } else {
                        toast({ variant: "destructive", title: "错误", description: "API返回结果中未找到深度图URL。" });
                    }
                } else {
                     console.error("生成失败:", message);
                     toast({ variant: "destructive", title: "错误", description: "深度图生成失败。" });
                }
            });

            // 添加错误处理事件监听器
            eventSource.addEventListener('error', (err) => {
                console.error("EventSource failed:", err);
                eventSource.close();
                toast({ variant: "destructive", title: "错误", description: "获取结果时发生错误。" });
                setIsGenerating(false);
            });

        } catch (error) {
            console.error("生成深度图时出错:", error);
            toast({ variant: "destructive", title: "错误", description: `生成深度图时出错: ${error instanceof Error ? error.message : String(error)}` });
            setIsGenerating(false);
        }
    };


    return (
        <Card className="w-full max-w-2xl bg-card/80 backdrop-blur-sm border-border/50 shadow-2xl shadow-black/20">
            <CardHeader>
                <CardTitle className="text-3xl font-bold text-center">空间照片构建器</CardTitle>
                <CardDescription className="text-center">
                    请上传一张照片及其对应的深度图。
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
                        onGenerateClick={handleGenerateDepthMap}
                        isGenerating={isGenerating}
                        apiUrl={apiUrl}
                        setApiUrl={setApiUrl}
                        defaultApiUrl={defaultApiUrl}
                    />
                    <FileInputBox 
                        id="depth-map-upload" 
                        onFileSelect={setDepthMapFile} 
                        acceptedFile={depthMapFile} 
                        label="深度图 (灰度)" 
                        description="白色靠近，黑色远离"
                        icon={<UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />}
                        apiUrl={apiUrl}
                        setApiUrl={setApiUrl}
                        defaultApiUrl={defaultApiUrl}
                    />
                </div>
                <Button onClick={handleSubmit} disabled={!imageFile || !depthMapFile} size="lg" className="w-full text-lg py-6">
                    构建3D场景
                </Button>
            </CardContent>
        </Card>
    );
}
