{
  description = "Everything behind the ryanseipp.com domain";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    treefmt-nix = {
      url = "github:numtide/treefmt-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      treefmt-nix,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        treefmtEval = treefmt-nix.lib.evalModule pkgs ./treefmt.nix;
      in
      {
        formatter = treefmtEval.config.build.wrapper;

        devShells.default = pkgs.mkShell {
          packages =
            (with pkgs; [
              deno
              nodejs_24
              tailwindcss-language-server
              nodePackages."@astrojs/language-server"
            ])
            ++ (with pkgs.nodePackages; [
              svgo
              pnpm
              prettier
              typescript
            ]);
        };

        checks = {
          formatting = treefmtEval.config.build.check self;
        };
      }
    );
}
