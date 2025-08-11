
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Github } from "lucide-react";
import Link from "next/link";

export default function AboutPage() {
    return (
        <div className="flex items-center justify-center min-h-screen bg-background p-4">
            <Card className="w-full max-w-2xl">
                <CardHeader>
                    <div className="flex items-center justify-between">
                         <CardTitle className="text-2xl">关于此项目</CardTitle>
                         <Link href="/" passHref>
                            <Button variant="ghost">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                返回
                            </Button>
                        </Link>
                    </div>
                    <CardDescription>作者、灵感与技术栈</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <h3 className="font-semibold">作者</h3>
                        <div className="text-muted-foreground space-x-4">
                            <a href="https://www.coolapk.com/u/765390" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                @橘子Jun (酷安)
                            </a>
                             <a href="https://linux.do/u/gengyj16" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                @gengyj16 (Linux.do)
                            </a>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h3 className="font-semibold">设计灵感</h3>
                        <p className="text-muted-foreground">
                            灵感来源于iOS 17图库照片可生成空间照片的功能。此网页应用旨在通过开源技术，在浏览器中复现类似的沉浸式体验。
                        </p>
                    </div>
                    <div className="space-y-2">
                        <h3 className="font-semibold">实现技术</h3>
                        <p className="text-muted-foreground">
                            通过强大的开源模型 <a href="https://github.com/LiheYoung/Depth-Anything" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Depth-Anything-V2</a> 生成深度图，并结合 <a href="https://threejs.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Three.js</a> 在网页上构建和渲染3D场景，从而实现了“低配版”空间照片效果。
                            此外，这个项目本身是 <a href="https://studio.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Firebase Studio</a> 构建的。
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
