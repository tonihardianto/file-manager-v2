# FileManager UI Kit

Reusable UI package extracted from this project.

## Included exports

- `CopyLinkModal`
- `FileList` and `FileMeta`
- `UploadDropzone` and `UploadEntry`
- `UploadWidget`

## 1) Copy to another project

Copy this folder to your target project:

- `src/uikit/`

You will also need the original component files because the current exports re-use them:

- `src/components/CopyLinkModal.tsx`
- `src/components/FileList.tsx`
- `src/components/UploadDropzone.tsx`
- `src/components/UploadWidget.tsx`

## 2) Install dependencies

At minimum:

```bash
npm install react react-dom lucide-react
```

If your app uses this exact theme setup:

```bash
npm install tailwindcss
```

## 3) Load the shared theme

In your main css entry:

```css
@import "tailwindcss";
@import "./uikit/theme.css";
```

## 4) Consume components

```tsx
import { FileList, UploadDropzone, UploadWidget, CopyLinkModal } from './uikit'
```

## Notes

- Theme switch works by setting `data-theme="dark"` or `data-theme="light"` on `<html>`.
- `FileList` expects file data similar to `FileMeta` and callbacks for actions.
- `UploadDropzone` and `UploadWidget` are intentionally stateless regarding API calls; pass your own upload logic.
