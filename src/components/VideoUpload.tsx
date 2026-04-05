import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Video, Upload, Loader2 } from 'lucide-react';

interface VideoUploadProps {
  onVideoSelect: (videoFile: File) => void;
  isProcessing?: boolean;
}

export function VideoUpload({ onVideoSelect, isProcessing }: VideoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setSelectedVideo(URL.createObjectURL(file));
      onVideoSelect(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5" />
          Upload Video for Analysis
        </CardTitle>
        <CardDescription>
          Upload a video of your tennis ready position for frame-by-frame analysis
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        {selectedVideo && (
          <div className="rounded-lg overflow-hidden bg-muted">
            <video
              src={selectedVideo}
              controls
              className="w-full h-auto"
            />
          </div>
        )}

        <Button
          onClick={handleUploadClick}
          disabled={isProcessing}
          className="w-full"
          variant="outline"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing Video...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              {selectedVideo ? 'Select Different Video' : 'Select Video'}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
