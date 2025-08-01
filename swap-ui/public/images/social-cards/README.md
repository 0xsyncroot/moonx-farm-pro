# Social Media Card Images - MoonXFarm

## 🎯 Overview

Custom social media card images for optimal sharing experience across platforms. These images appear when MoonXFarm links are shared on social media.

## 📐 Required Specifications

### **OpenGraph (Facebook, LinkedIn, WhatsApp)**
- **Size**: 1200x630 pixels (1.91:1 ratio)
- **Format**: PNG or JPG
- **File Size**: < 300KB for fast loading
- **Safe Zone**: Keep important content within 1200x630 center area

### **Twitter Cards**
- **Size**: 1200x600 pixels (2:1 ratio) 
- **Format**: PNG or JPG
- **File Size**: < 5MB (recommended < 300KB)
- **Alt Text**: Required for accessibility

### **LinkedIn**
- **Size**: 1200x630 pixels (same as OpenGraph)
- **Format**: PNG or JPG
- **Text**: Should be readable at small sizes

## 🎨 Design Requirements

### **Brand Elements**
- **MoonXFarm Logo**: Prominent placement
- **Brand Colors**: Consistent with UI theme
- **Typography**: Clear, readable fonts
- **Background**: Dark theme to match app

### **Content Elements**
- **Page Title**: Clear, prominent heading
- **Key Features**: 2-3 bullet points max
- **Call to Action**: Subtle but clear
- **Visual Elements**: Charts, interface previews, icons

## 📁 Required Card Images

### **1. Home Page** (`og-home.png`)
**Content:**
- "MoonXFarm - Cross-Chain DEX Aggregator"
- "Trade with Zero Gas Fees"
- "✓ Account Abstraction ✓ Multi-Chain ✓ Best Rates"
- Background: Swap interface preview

### **2. Swap Page** (`og-swap.png`)
**Content:**
- "Crypto Swap | Best Rates Across Chains"
- "Compare 50+ DEXs in Real-Time"
- "✓ Gasless Trading ✓ Smart Routing ✓ MEV Protection"
- Background: Token swap interface

### **3. Orders Page** (`og-orders.png`)
**Content:**
- "Limit Orders & DCA Automation"
- "Set It and Forget It Trading"
- "✓ Automated Execution ✓ Smart Orders ✓ Zero Gas"
- Background: Order management interface

### **4. Portfolio Page** (`og-portfolio.png`)
**Content:**
- "Portfolio Tracker & P&L Analytics"
- "Track Performance Across 6+ Chains"
- "✓ Real-time Sync ✓ P&L Tracking ✓ Multi-Chain"
- Background: Portfolio dashboard

### **5. Wallet Settings** (`og-wallet.png`)
**Content:**
- "Smart Wallet with Account Abstraction"
- "Next-Gen Crypto Wallet Experience"
- "✓ Session Keys ✓ Gasless Setup ✓ Enterprise Security"
- Background: Wallet management interface

### **6. Alerts Page** (`og-alerts.png`)
**Content:**
- "Smart Alerts & Copy Trading"
- "Never Miss Trading Opportunities"
- "✓ Price Alerts ✓ Copy Trades ✓ Smart Notifications"
- Background: Alerts dashboard

## 🎨 Design Templates

### **Template Structure**
```
┌─────────────────────────────────────┐
│  MoonXFarm Logo    [Top Right Icon] │
│                                     │
│         MAIN TITLE                  │
│         Subtitle Text               │
│                                     │
│  ✓ Feature 1   ✓ Feature 2         │
│  ✓ Feature 3                       │
│                                     │
│     [Background: App Interface]     │
└─────────────────────────────────────┘
```

### **Color Palette**
- **Primary**: #3b82f6 (Blue)
- **Background**: #0f172a (Dark)
- **Text**: #ffffff (White)
- **Accent**: #10b981 (Green)
- **Secondary**: #64748b (Gray)

### **Typography**
- **Title**: Inter Bold, 48-56px
- **Subtitle**: Inter Medium, 24-28px
- **Features**: Inter Regular, 18-20px

## 🔧 Implementation

### **File Structure**
```
public/images/social-cards/
├── og-home.png           # Home page card
├── og-swap.png           # Swap page card
├── og-orders.png         # Orders page card
├── og-portfolio.png      # Portfolio page card
├── og-wallet.png         # Wallet settings card
├── og-alerts.png         # Alerts page card
├── twitter-home.png      # Twitter-specific (optional)
└── README.md             # This file
```

### **Metadata Integration**
```typescript
// In metadata.ts
export const pageMetadata = {
  home: {
    openGraph: {
      images: [
        {
          url: '/images/social-cards/og-home.png',
          width: 1200,
          height: 630,
          alt: 'MoonXFarm - Cross-Chain DEX Aggregator with Gasless Trading',
        },
      ],
    },
    twitter: {
      images: ['/images/social-cards/og-home.png'],
    },
  },
  // ... other pages
}
```

## 📊 Performance Optimization

### **Image Optimization**
- **Compression**: Use tools like TinyPNG, ImageOptim
- **Format**: PNG for graphics with text, JPG for photos
- **Loading**: Only load when page is shared (not on page load)
- **Caching**: Set proper cache headers for social crawlers

### **File Size Targets**
| Image | Target Size | Max Size | Quality |
|-------|-------------|----------|---------|
| og-home.png | 150KB | 300KB | 85% |
| og-swap.png | 150KB | 300KB | 85% |
| og-orders.png | 150KB | 300KB | 85% |
| og-portfolio.png | 150KB | 300KB | 85% |
| og-wallet.png | 150KB | 300KB | 85% |
| og-alerts.png | 150KB | 300KB | 85% |

## 🎯 A/B Testing Opportunities

### **Test Variations**
1. **Background**: Interface preview vs abstract graphics
2. **Text Amount**: Minimal vs descriptive
3. **Call to Action**: "Trade Now" vs "Get Started" vs none
4. **Color Scheme**: Dark vs light theme
5. **Logo Placement**: Top left vs top right vs center

### **Metrics to Track**
- Click-through rate from social media
- Engagement rate on shared posts
- Conversion rate from social traffic
- Brand recognition metrics

## 🛠️ Creation Tools

### **Design Software**
- **Figma**: Collaborative design with templates
- **Canva**: Quick creation with templates
- **Adobe Photoshop**: Professional editing
- **Sketch**: Mac-based design tool

### **Automation Options**
- **Dynamic OG Images**: Generate cards programmatically
- **Vercel OG**: Generate images at request time
- **Cloudinary**: Dynamic image transformation
- **Custom API**: Generate cards based on page content

## 📱 Platform-Specific Considerations

### **Facebook/Meta**
- Tests images before allowing sharing
- Caches images aggressively (24-48 hours)
- Supports both 1200x630 and 1200x628
- Debug tool: developers.facebook.com/tools/debug/

### **Twitter/X**
- Supports summary_large_image cards
- Faster cache refresh than Facebook
- Alt text is important for accessibility
- Debug tool: cards-dev.twitter.com/validator

### **LinkedIn**
- Professional context requires clean design
- Higher engagement with business-focused content
- Supports same specs as OpenGraph
- Debug tool: linkedin.com/post-inspector/

### **WhatsApp**
- Uses OpenGraph meta tags
- Smaller preview size in mobile
- Text should be readable at small sizes
- No official debug tool

---

## 📋 Action Items

### **Immediate (High Priority)**
- [ ] Create og-home.png (main landing page)
- [ ] Create og-swap.png (primary feature)
- [ ] Update metadata.ts với new image paths
- [ ] Test sharing on major platforms

### **Short Term (Medium Priority)**
- [ ] Create remaining page-specific cards
- [ ] Optimize file sizes for performance
- [ ] A/B test different designs
- [ ] Set up dynamic generation system

### **Long Term (Low Priority)**
- [ ] Implement dynamic OG image generation
- [ ] Create platform-specific variations
- [ ] Add analytics tracking for social traffic
- [ ] Automate card updates with content changes

**Status**: 📋 **Cards Need Creation** - Design templates and specifications ready for implementation. 