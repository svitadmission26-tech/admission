# Module Integration Map

- Legacy admission ERP remains the backbone and is reused by the ERP module screens.
- `src/lib/erpModules.js` declares the 25 modules; `ErpModuleScreen.jsx` renders them.
- Inquiry Forms (`inquiry_forms`) feed `InquiryModule.jsx` public inquiry rendering.
- College timings (`college_timings`) feed both College Timing admin screen and public inquiry timing slots.
- Student/faculty masters are shared; module tables link to them instead of duplicating.
- Dynamic forms are stored as schema versions; old submissions are not rewritten.