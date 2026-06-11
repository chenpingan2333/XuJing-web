"use client";

export default function AvatarUpload() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center">
        <span className="text-gray-500 text-sm">头像</span>
      </div>
      <div className="flex-1">
        <div className="text-sm text-gray-600 mb-1">头像上传</div>
        <div className="text-xs text-gray-400">功能开发中</div>
      </div>
    </div>
  );
}