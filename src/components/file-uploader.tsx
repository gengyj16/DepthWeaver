"use client";

import { useState, ChangeEvent, DragEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { UploadCloud, FileImage, CheckCircle2 } from 'lucide-react';

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
}

const FileInputBox = ({ id, onFileSelect, acceptedFile, label, description, icon }: FileInputBoxProps) => {
    const [isDragging, setIsDragging] = useState(false);

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
            <div className='flex items-baseline justify-between'>
                <label htmlFor={id} className="block text-sm font-medium text-foreground">{label}</label>
                <p className='text-xs text-muted-foreground'>{description}</p>
            </div>
            <label
                htmlFor={id}
                className={cn(
                    "relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-card hover:bg-muted/50 border-border transition-colors",
                    isDragging && "border-primary bg-primary/10"
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragEnter}
                onDrop={handleDrop}
            >
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
                    {acceptedFile ? (
                        <>
                            <CheckCircle2 className="w-10 h-10 mb-3 text-primary" />
                            <p className="mb-2 text-sm font-semibold max-w-full truncate px-2">{acceptedFile.name}</p>
                            <p className="text-xs text-muted-foreground">点击或拖动来更换</p>
                        </>
                    ) : (
                        <>
                            {icon}
                            <p className="mb-2 text-sm text-muted-foreground"><span className="font-semibold text-primary">点击上传</span> 或拖放文件</p>
                            <p className="text-xs text-muted-foreground">支持 PNG, JPG, 或 WEBP</p>
                        </>
                    )}
                </div>
                <input id={id} type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" />
            </label>
        </div>
    );
};

export function FileUploader({ onFilesSelected }: FileUploaderProps) {
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [depthMapFile, setDepthMapFile] = useState<File | null>(null);

    const handleSubmit = () => {
        if (imageFile && depthMapFile) {
            onFilesSelected(imageFile, depthMapFile);
        }
    };

    return (
        <Card className="w-full max-w-2xl bg-card/80 backdrop-blur-sm border-border/50 shadow-2xl shadow-black/20">
            <CardHeader>
                <CardTitle className="text-3xl font-bold text-center">创建您的3D场景</CardTitle>
                <CardDescription className="text-center">
                    请上传一张彩色图片及其对应的深度图。
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FileInputBox 
                        id="image-upload" 
                        onFileSelect={setImageFile} 
                        acceptedFile={imageFile} 
                        label="彩色图片" 
                        description=""
                        icon={<FileImage className="w-10 h-10 mb-3 text-muted-foreground" />}
                    />
                    <FileInputBox 
                        id="depth-map-upload" 
                        onFileSelect={setDepthMapFile} 
                        acceptedFile={depthMapFile} 
                        label="深度图 (灰度)" 
                        description="白色靠近，黑色远离"
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
