
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
                        <div className="text-muted-foreground flex items-center gap-4">
                            <span>@橘子Jun</span>
                            <a href="https://www.coolapk.com/feed/66615199?s=NjY3ODU2NDdiYWRjZWc2ODk5ZmE2ZXoa1550" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                酷安图文
                            </a>
                             <a href="https://linux.do/t/topic/859525" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                Linux.do帖子
                            </a>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h3 className="font-semibold">设计灵感</h3>
                        <p className="text-muted-foreground">
                            灵感来源于iOS 26图库照片可生成空间照片的功能。此网页应用旨在通过开源技术，在浏览器中复现类似的沉浸式体验。
                        </p>
                    </div>
                    <div className="space-y-2">
                        <h3 className="font-semibold">实现技术</h3>
                        <p className="text-muted-foreground break-all">
                            通过强大的开源模型 <a href="https://github.com/DepthAnything/Depth-Anything-V2" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Depth-Anything-V2</a> 生成深度图，并结合 <a href="https://threejs.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Three.js</a> 在网页上构建和渲染3D场景，从而实现了“低配版”空间照片效果。
                            此外，这个项目本身是 <a href="https://studio.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Firebase Studio</a> 构建的。开源地址：https://github.com/gengyj16/DepthWeaver
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
