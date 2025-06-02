{ ... }:
{
  projectRootFile = "flake.nix";
  settings.global.excludes = [
    ".envrc"
    "LICENSE"
    "*.gitignore"
    "*.gitkeep"
    "*.node-version"
    "*.astro"
    "*.svg"
    "*.png"
    "*.ico"
    "*.xsl"
    "*.webmanifest"
  ];

  programs = {
    nixfmt.enable = true;
    leptosfmt.enable = true;
    rustfmt.enable = true;

    prettier = {
      enable = true;
      settings = {
        proseWrap = "always";
      };
    };
  };
}
