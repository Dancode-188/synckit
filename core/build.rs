// Build script to generate Rust code from Protocol Buffers

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Set up vendored protoc
    std::env::set_var("PROTOC", protoc_bin_vendored::protoc_bin_path().unwrap());
    
    // Get the proto file paths
    let proto_files = vec![
        "../protocol/specs/types.proto",
        "../protocol/specs/messages.proto",
        "../protocol/specs/sync.proto",
    ];
    
    // Configure prost to generate code
    prost_build::Config::new()
        // Output directory for generated code
        .out_dir("src/protocol/gen")
        // Generate serde Serialize/Deserialize implementations
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        // Compile the proto files
        .compile_protos(&proto_files, &["../protocol/specs/"])?;
    
    // Tell cargo to recompile if proto files change
    for proto in &proto_files {
        println!("cargo:rerun-if-changed={}", proto);
    }
    
    Ok(())
}
