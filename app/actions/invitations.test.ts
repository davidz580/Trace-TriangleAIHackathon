import { describe, it, expect, vi, beforeEach } from "vitest";

const mockToDataURL = vi.fn();

vi.mock("qrcode", () => ({
  default: {
    toDataURL: (...args: unknown[]) => mockToDataURL(...args),
  },
}));

import { generateQRCodeDataUrl } from "./invitations";

describe("generateQRCodeDataUrl", () => {
  beforeEach(() => {
    mockToDataURL.mockReset();
  });

  it("receives a complete invitation URL, not just a raw token", async () => {
    const fullUrl =
      "https://trace.vercel.app/reflect?token=1110d4a62d08e706ccb055cba01603950e518efdde5c4db48486dfeac9363637";
    mockToDataURL.mockResolvedValueOnce("data:image/png;base64,test");

    await generateQRCodeDataUrl(fullUrl);

    expect(mockToDataURL).toHaveBeenCalledTimes(1);
    expect(mockToDataURL).toHaveBeenCalledWith(fullUrl, {
      width: 256,
      margin: 2,
    });
  });

  it("returns the data URL produced by the QR library", async () => {
    const fullUrl = "http://localhost:3000/reflect?token=abc123";
    mockToDataURL.mockResolvedValueOnce("data:image/png;base64,expected");

    const result = await generateQRCodeDataUrl(fullUrl);

    expect(result).toBe("data:image/png;base64,expected");
  });
});
